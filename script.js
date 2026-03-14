/**
 * PianoVerse - Core Logic
 */

class AudioEngine {
    constructor() {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.samples = {};
        this.activeNodes = {};
        this.volume = 0.7;
        this.octave = 3;
        this.toneProfile = 'classic';
        
        // Audio Chains
        this.masterGain = this.ctx.createGain();
        this.filter = this.ctx.createBiquadFilter();
        
        this.filter.connect(this.masterGain);
        this.masterGain.connect(this.ctx.destination);
        
        // Tone Profiles
        this.profiles = {
            'classic': { type: 'allpass', freq: 1000, Q: 1 },
            'warm': { type: 'lowpass', freq: 800, Q: 1 },
            'bright': { type: 'highpass', freq: 1200, Q: 1 },
            'heavy': { type: 'lowshelf', freq: 400, Q: 0.5 }
        };

        this.notes = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
        
        // CDN for high quality piano samples (Salamander Grand Piano)
        this.baseUrl = 'https://raw.githubusercontent.com/fuhton/piano-mp3/master/piano-mp3/';
    }

    async loadSamples() {
        console.log("Loading samples...");
        // Load notes for current octave and one above/below for full range
        const notesToLoad = [];
        for (let oct = this.octave - 1; oct <= this.octave + 2; oct++) {
            this.notes.forEach(note => {
                notesToLoad.push(`${note}${oct}`);
            });
        }

        const promises = notesToLoad.map(async (note) => {
            try {
                const response = await fetch(`${this.baseUrl}${note}.mp3`);
                const arrayBuffer = await response.arrayBuffer();
                const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
                this.samples[note] = audioBuffer;
            } catch (err) {
                console.error(`Error loading note ${note}:`, err);
            }
        });

        await Promise.all(promises);
        console.log("All samples loaded.");
    }

    playNote(noteName, octave = this.octave) {
        // Ensure context is running (needed for modern browsers)
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
        
        const fullNote = `${noteName}${octave}`;
        if (!this.samples[fullNote]) return;

        // Stop existing node if playing to prevent overlap (optional based on feel)
        // if (this.activeNodes[fullNote]) this.activeNodes[fullNote].stop();

        const source = this.ctx.createBufferSource();
        source.buffer = this.samples[fullNote];

        const gainNode = this.ctx.createGain();
        gainNode.gain.setValueAtTime(this.volume, this.ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 1.5);

        source.connect(gainNode);
        gainNode.connect(this.filter);

        source.start(0);
        source.stop(this.ctx.currentTime + 1.5);
        
        this.activeNodes[fullNote] = source;
    }

    setTone(profile) {
        if (!this.profiles[profile]) return;
        this.toneProfile = profile;
        const p = this.profiles[profile];
        this.filter.type = p.type;
        this.filter.frequency.setTargetAtTime(p.freq, this.ctx.currentTime, 0.1);
        this.filter.Q.setTargetAtTime(p.Q, this.ctx.currentTime, 0.1);
    }

    setVolume(val) {
        this.volume = parseFloat(val);
        this.masterGain.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.1);
    }
}

class KeyboardUI {
    constructor(pianoElement, audioEngine) {
        this.piano = pianoElement;
        this.engine = audioEngine;
        this.keyMap = {
            'a': 'C', 'w': 'Db', 's': 'D', 'e': 'Eb', 'd': 'E', 
            'f': 'F', 't': 'Gb', 'g': 'G', 'y': 'Ab', 'h': 'A', 'u': 'Bb', 'j': 'B'
        };
        this.activeKeys = new Set();
        this.init();
    }

    init() {
        this.render();
        this.attachEvents();
    }

    render() {
        this.piano.innerHTML = '';
        const notes = this.engine.notes;
        const baseOctave = this.engine.octave;

        // Render 2 octaves
        for (let octOffset = 0; octOffset < 2; octOffset++) {
            const currentOctave = baseOctave + octOffset;
            notes.forEach((note) => {
                const isBlack = note.includes('b');
                const key = document.createElement('div');
                key.className = `key ${isBlack ? 'black' : 'white'}`;
                key.dataset.note = note;
                key.dataset.octave = currentOctave;
                
                if (!isBlack) {
                    const label = document.createElement('span');
                    label.className = 'key-label';
                    // Mapping for the first octave
                    if (octOffset === 0) {
                        const kbd = Object.keys(this.keyMap).find(k => this.keyMap[k] === note);
                        label.innerText = kbd ? kbd.toUpperCase() : '';
                    } else {
                        label.innerText = ''; // Keep it clean for the second octave
                    }
                    key.appendChild(label);
                }

                this.piano.appendChild(key);
            });
        }
    }

    attachEvents() {
        // Click events
        this.piano.addEventListener('mousedown', (e) => {
            const key = e.target.closest('.key');
            if (key) this.pressKey(key);
        });

        window.addEventListener('mouseup', () => {
            document.querySelectorAll('.key.active').forEach(k => k.classList.remove('active'));
        });

        // Touch support
        this.piano.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const key = e.target.closest('.key');
            if (key) this.pressKey(key);
        }, { passive: false });

        // Keyboard events
        window.addEventListener('keydown', (e) => {
            if (e.repeat) return;
            const note = this.keyMap[e.key.toLowerCase()];
            if (note) {
                const keyElement = this.piano.querySelector(`[data-note="${note}"]`);
                if (keyElement) this.pressKey(keyElement);
            }
        });

        window.addEventListener('keyup', (e) => {
            const note = this.keyMap[e.key.toLowerCase()];
            if (note) {
                const keyElement = this.piano.querySelector(`[data-note="${note}"]`);
                if (keyElement) keyElement.classList.remove('active');
            }
        });
    }

    pressKey(keyElement) {
        keyElement.classList.add('active');
        const note = keyElement.dataset.note;
        const octave = parseInt(keyElement.dataset.octave);
        this.engine.playNote(note, octave);
        
        // Update display
        document.getElementById('current-note').innerText = note.replace('b', '#');
        
        // Trigger recording if active
        if (window.app && window.app.recorder.isRecording) {
            window.app.recorder.capture(note, octave);
        }
    }
}

class Recorder {
    constructor(engine) {
        this.engine = engine;
        this.isRecording = false;
        this.sequence = [];
        this.startTime = 0;
        this.savedRecordings = JSON.parse(localStorage.getItem('piano_recordings') || '[]');
    }

    start() {
        this.isRecording = true;
        this.sequence = [];
        this.startTime = Date.now();
    }

    stop() {
        this.isRecording = false;
    }

    capture(note, octave) {
        if (!this.isRecording) return;
        this.sequence.push({
            note,
            octave,
            time: Date.now() - this.startTime
        });
    }

    clear() {
        this.sequence = [];
    }

    save() {
        if (this.sequence.length === 0) return;
        const recording = {
            id: Date.now(),
            name: `Song_${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
            date: new Date().toLocaleDateString(),
            sequence: [...this.sequence]
        };
        this.savedRecordings.unshift(recording);
        localStorage.setItem('piano_recordings', JSON.stringify(this.savedRecordings));
        return recording;
    }

    delete(id) {
        this.savedRecordings = this.savedRecordings.filter(r => r.id !== id);
        localStorage.setItem('piano_recordings', JSON.stringify(this.savedRecordings));
    }

    async play(sequence = this.sequence) {
        if (sequence.length === 0) return;
        
        const start = Date.now();
        for (const item of sequence) {
            const delay = item.time - (Date.now() - start);
            await new Promise(r => setTimeout(r, Math.max(0, delay)));
            
            // Visual feedback
            const key = document.querySelector(`[data-note="${item.note}"][data-octave="${item.octave}"]`);
            if (key) {
                key.classList.add('active');
                setTimeout(() => key.classList.remove('active'), 200);
            }
            this.engine.playNote(item.note, item.octave);
        }
    }
}

class Metronome {
    constructor() {
        this.bpm = 120;
        this.isPlaying = false;
        this.interval = null;
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }

    start() {
        if (this.isPlaying) return;
        this.isPlaying = true;
        this.schedule();
    }

    stop() {
        this.isPlaying = false;
        clearTimeout(this.interval);
    }

    setBPM(val) {
        this.bpm = parseInt(val);
        if (this.isPlaying) {
            this.stop();
            this.start();
        }
    }

    schedule() {
        if (!this.isPlaying) return;
        
        const osc = this.ctx.createOscillator();
        const envelope = this.ctx.createGain();

        osc.frequency.value = 880;
        envelope.gain.value = 1;
        envelope.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.1);

        osc.connect(envelope);
        envelope.connect(this.ctx.destination);

        osc.start(this.ctx.currentTime);
        osc.stop(this.ctx.currentTime + 0.1);

        const secondsPerBeat = 60.0 / this.bpm;
        this.interval = setTimeout(() => this.schedule(), secondsPerBeat * 1000);
    }
}

class SongPlayer {
    constructor(engine, ui) {
        this.engine = engine;
        this.ui = ui;
        this.isPlaying = false;
        this.songs = {
            'twinkle': [
                { note: 'C', octave: 3, time: 0 }, { note: 'C', octave: 3, time: 500 },
                { note: 'G', octave: 3, time: 1000 }, { note: 'G', octave: 3, time: 1500 },
                { note: 'A', octave: 3, time: 2000 }, { note: 'A', octave: 3, time: 2500 },
                { note: 'G', octave: 3, time: 3000 },
                { note: 'F', octave: 3, time: 4000 }, { note: 'F', octave: 3, time: 4500 },
                { note: 'E', octave: 3, time: 5000 }, { note: 'E', octave: 3, time: 5500 },
                { note: 'D', octave: 3, time: 6000 }, { note: 'D', octave: 3, time: 6500 },
                { note: 'C', octave: 3, time: 7000 }
            ],
            'jingle': [
                { note: 'E', octave: 3, time: 0 }, { note: 'E', octave: 3, time: 400 }, { note: 'E', octave: 3, time: 800 },
                { note: 'E', octave: 3, time: 1200 }, { note: 'E', octave: 3, time: 1600 }, { note: 'E', octave: 3, time: 2000 },
                { note: 'E', octave: 3, time: 2400 }, { note: 'G', octave: 3, time: 2600 }, { note: 'C', octave: 3, time: 2800 }, { note: 'D', octave: 3, time: 3200 },
                { note: 'E', octave: 3, time: 3600 }
            ],
            'fur-elise': [
                { note: 'E', octave: 4, time: 0 }, { note: 'Eb', octave: 4, time: 200 },
                { note: 'E', octave: 4, time: 400 }, { note: 'Eb', octave: 4, time: 600 },
                { note: 'E', octave: 4, time: 800 }, { note: 'B', octave: 3, time: 1000 },
                { note: 'D', octave: 4, time: 1200 }, { note: 'C', octave: 4, time: 1400 },
                { note: 'A', octave: 3, time: 1600 }
            ],
            'munbe-vaa': [
                { note: 'Bb', octave: 3, time: 0 }, { note: 'Bb', octave: 3, time: 400 }, 
                { note: 'Ab', octave: 3, time: 800 }, { note: 'Gb', octave: 3, time: 1200 }, 
                { note: 'F', octave: 3, time: 1600 }, { note: 'F', octave: 3, time: 2000 },
                { note: 'Gb', octave: 3, time: 2400 }, { note: 'Bb', octave: 3, time: 2800 },
                { note: 'Bb', octave: 3, time: 3200 }, { note: 'Bb', octave: 3, time: 3600 },
                { note: 'Ab', octave: 3, time: 4000 }, { note: 'Ab', octave: 3, time: 4400 },
                { note: 'Bb', octave: 3, time: 4800 }, { note: 'C', octave: 4, time: 5200 },
                { note: 'Bb', octave: 3, time: 5600 }
            ],
            'kannaana-kanney': [
                { note: 'Bb', octave: 4, time: 0 }, { note: 'D', octave: 4, time: 400 }, { note: 'Eb', octave: 4, time: 800 },
                { note: 'Eb', octave: 4, time: 1400 }, { note: 'Eb', octave: 4, time: 1800 },
                { note: 'D', octave: 4, time: 2400 }, { note: 'Eb', octave: 4, time: 2800 }, { note: 'F', octave: 4, time: 3200 }, { note: 'Eb', octave: 4, time: 3600 },
                { note: 'Eb', octave: 4, time: 4200 }, { note: 'Eb', octave: 4, time: 4600 }
            ],
            'vaseegara': [
                { note: 'Gb', octave: 4, time: 0 }, { note: 'Gb', octave: 4, time: 250 }, { note: 'Gb', octave: 4, time: 500 }, { note: 'Gb', octave: 4, time: 750 },
                { note: 'E', octave: 4, time: 1000 }, { note: 'E', octave: 4, time: 1250 }, { note: 'D', octave: 4, time: 1500 }, { note: 'Db', octave: 4, time: 1750 },
                { note: 'Db', octave: 4, time: 2000 }, { note: 'D', octave: 4, time: 2250 }, { note: 'E', octave: 4, time: 2500 }
            ],
            'ennodu-nee': [
                { note: 'Eb', octave: 3, time: 0 }, { note: 'Ab', octave: 3, time: 400 }, { note: 'Gb', octave: 3, time: 800 }, { note: 'Ab', octave: 3, time: 1200 },
                { note: 'E', octave: 3, time: 1800 }, { note: 'B', octave: 3, time: 2200 }, { note: 'Bb', octave: 3, time: 2600 }, { note: 'B', octave: 3, time: 3000 }
            ],
            'nila-kaigirathu': [
                { note: 'G', octave: 3, time: 0 }, { note: 'A', octave: 3, time: 300 }, { note: 'Bb', octave: 3, time: 600 }, { note: 'C', octave: 4, time: 900 }, { note: 'Bb', octave: 3, time: 1200 },
                { note: 'A', octave: 3, time: 1500 }, { note: 'G', octave: 3, time: 1800 }, { note: 'F', octave: 3, time: 2100 }
            ],
            'pookkalae': [
                { note: 'Eb', octave: 4, time: 0 }, { note: 'F', octave: 4, time: 400 }, { note: 'G', octave: 4, time: 800 }, { note: 'F', octave: 4, time: 1200 },
                { note: 'Eb', octave: 4, time: 1600 }, { note: 'D', octave: 4, time: 2000 }, { note: 'C', octave: 4, time: 2400 }, { note: 'Bb', octave: 3, time: 2800 }
            ]
        };
    }

    async play(songId) {
        if (this.isPlaying || !this.songs[songId]) return;
        this.isPlaying = true;
        const song = this.songs[songId];
        const start = Date.now();

        for (const item of song) {
            if (!this.isPlaying) break;
            const delay = item.time - (Date.now() - start);
            await new Promise(r => setTimeout(r, Math.max(0, delay)));
            
            this.engine.playNote(item.note, item.octave);
            // Highlight key
            const key = document.querySelector(`[data-note="${item.note}"][data-octave="${item.octave}"]`);
            if (key) {
                key.classList.add('active');
                setTimeout(() => key.classList.remove('active'), 200);
            }
        }
        this.isPlaying = false;
    }

    stop() {
        this.isPlaying = false;
    }
}

class BeatPlayer {
    constructor(ctx) {
        this.ctx = ctx;
        this.isPlaying = false;
        this.bpm = 120;
        this.currentBeat = 0;
        this.interval = null;
        this.patterns = {
            'pop': [
                { drum: 'kick', beat: 0 },
                { drum: 'hihat', beat: 0.5 },
                { drum: 'snare', beat: 1 },
                { drum: 'hihat', beat: 1.5 },
                { drum: 'kick', beat: 2 },
                { drum: 'hihat', beat: 2.5 },
                { drum: 'snare', beat: 3 },
                { drum: 'hihat', beat: 3.5 }
            ],
            'rock': [
                { drum: 'kick', beat: 0 },
                { drum: 'hihat', beat: 0 },
                { drum: 'hihat', beat: 0.5 },
                { drum: 'snare', beat: 1 },
                { drum: 'hihat', beat: 1 },
                { drum: 'hihat', beat: 1.5 },
                { drum: 'kick', beat: 2 },
                { drum: 'hihat', beat: 2 },
                { drum: 'hihat', beat: 2.5 },
                { drum: 'snare', beat: 3 },
                { drum: 'hihat', beat: 3 },
                { drum: 'hihat', beat: 3.5 }
            ],
            'techno': [
                { drum: 'kick', beat: 0 }, { drum: 'hihat', beat: 0.25 }, { drum: 'hihat', beat: 0.5 }, { drum: 'hihat', beat: 0.75 },
                { drum: 'kick', beat: 1 }, { drum: 'hihat', beat: 1.25 }, { drum: 'hihat', beat: 1.5 }, { drum: 'hihat', beat: 1.75 },
                { drum: 'kick', beat: 2 }, { drum: 'hihat', beat: 2.25 }, { drum: 'hihat', beat: 2.5 }, { drum: 'hihat', beat: 2.75 },
                { drum: 'kick', beat: 3 }, { drum: 'hihat', beat: 3.25 }, { drum: 'hihat', beat: 3.5 }, { drum: 'hihat', beat: 3.75 }
            ],
            'folk': [
                { drum: 'kick', beat: 0 }, { drum: 'kick', beat: 0.33 },
                { drum: 'snare', beat: 0.66 },
                { drum: 'kick', beat: 1 }, { drum: 'kick', beat: 1.33 },
                { drum: 'snare', beat: 1.66 },
                { drum: 'kick', beat: 2 }, { drum: 'kick', beat: 2.33 },
                { drum: 'snare', beat: 2.66 },
                { drum: 'kick', beat: 3 }, { drum: 'kick', beat: 3.33 },
                { drum: 'snare', beat: 3.66 }
            ]
        };
    }

    playKick(time) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.frequency.setValueAtTime(150, time);
        osc.frequency.exponentialRampToValueAtTime(0.01, time + 0.5);
        gain.gain.setValueAtTime(1, time);
        gain.gain.exponentialRampToValueAtTime(0.01, time + 0.5);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(time);
        osc.stop(time + 0.5);
    }

    playSnare(time) {
        const noise = this.ctx.createBufferSource();
        const bufferSize = this.ctx.sampleRate * 0.1;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
        noise.buffer = buffer;

        const noiseFilter = this.ctx.createBiquadFilter();
        noiseFilter.type = 'highpass';
        noiseFilter.frequency.value = 1000;
        noise.connect(noiseFilter);

        const noiseGain = this.ctx.createGain();
        noiseGain.gain.setValueAtTime(1, time);
        noiseGain.gain.exponentialRampToValueAtTime(0.01, time + 0.2);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(this.ctx.destination);

        const osc = this.ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(100, time);
        const oscGain = this.ctx.createGain();
        oscGain.gain.setValueAtTime(0.7, time);
        oscGain.gain.exponentialRampToValueAtTime(0.01, time + 0.1);
        osc.connect(oscGain);
        oscGain.connect(this.ctx.destination);

        noise.start(time);
        osc.start(time);
        noise.stop(time + 0.2);
        osc.stop(time + 0.2);
    }

    playHiHat(time) {
        const osc = this.ctx.createOscillator();
        osc.type = 'square';
        osc.frequency.setValueAtTime(10000, time);
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.3, time);
        gain.gain.exponentialRampToValueAtTime(0.01, time + 0.05);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(time);
        osc.stop(time + 0.05);
    }

    start(patternId) {
        if (this.isPlaying) this.stop();
        if (!this.patterns[patternId]) return;

        this.isPlaying = true;
        const secondsPerBeat = 60.0 / this.bpm;
        const pattern = this.patterns[patternId];
        let nextBeatTime = this.ctx.currentTime;

        const loop = () => {
            if (!this.isPlaying) return;
            pattern.forEach(step => {
                const time = nextBeatTime + (step.beat * secondsPerBeat);
                if (step.drum === 'kick') this.playKick(time);
                if (step.drum === 'snare') this.playSnare(time);
                if (step.drum === 'hihat') this.playHiHat(time);
            });
            nextBeatTime += 4 * secondsPerBeat; // 4 beats per bar
            this.interval = setTimeout(loop, 4 * secondsPerBeat * 1000);
        };
        loop();
    }

    stop() {
        this.isPlaying = false;
        clearTimeout(this.interval);
    }
}

class App {
    constructor() {
        this.engine = new AudioEngine();
        this.recorder = new Recorder(this.engine);
        this.ui = new KeyboardUI(document.getElementById('piano'), this.engine);
        this.metronome = new Metronome();
        this.songPlayer = new SongPlayer(this.engine, this.ui);
        this.beatPlayer = new BeatPlayer(this.engine.ctx);
        
        this.presets = {
            songs: {
                'munbe-vaa': { octave: 3, beat: 'folk', tone: 'warm' },
                'kannaana-kanney': { octave: 4, beat: 'none', tone: 'bright' },
                'vaseegara': { octave: 4, beat: 'pop', tone: 'classic' },
                'ennodu-nee': { octave: 3, beat: 'pop', tone: 'heavy' },
                'nila-kaigirathu': { octave: 3, beat: 'rock', tone: 'warm' },
                'pookkalae': { octave: 4, beat: 'none', tone: 'bright' }
            },
            beats: {
                'pop': { tone: 'classic' },
                'rock': { tone: 'heavy' },
                'techno': { tone: 'bright' },
                'folk': { tone: 'warm' }
            }
        };

        this.initEventListeners();
    }

    async init() {
        await this.engine.loadSamples();
        console.log("App ready!");
        document.body.classList.add('ready');
        this.renderRecordings();
    }

    setOctave(octave) {
        this.engine.octave = octave;
        const btns = document.querySelectorAll('.octave-btn');
        btns.forEach(b => {
            b.classList.toggle('active', parseInt(b.dataset.octave) === octave);
        });
        this.ui.render();
    }

    initEventListeners() {
        // Volume
        const volumeSlider = document.getElementById('volume-slider');
        const volumeValue = document.getElementById('volume-value');
        volumeSlider.addEventListener('input', (e) => {
            this.engine.setVolume(e.target.value);
            volumeValue.innerText = Math.round(e.target.value * 100) + '%';
        });

        // Octave
        const octaveBtns = document.querySelectorAll('.octave-btn');
        octaveBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                this.setOctave(parseInt(btn.dataset.octave));
            });
        });

        // Recording
        const recBtn = document.getElementById('rec-btn');
        const playRecBtn = document.getElementById('play-rec-btn');
        const clearRecBtn = document.getElementById('clear-rec-btn');
        const saveRecBtn = document.getElementById('save-rec-btn');

        recBtn.addEventListener('click', () => {
            if (this.recorder.isRecording) {
                this.recorder.stop();
                recBtn.classList.remove('recording');
                playRecBtn.disabled = this.recorder.sequence.length === 0;
                saveRecBtn.disabled = this.recorder.sequence.length === 0;
                recBtn.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20"><circle fill="currentColor" cx="12" cy="12" r="6"/></svg>';
            } else {
                this.recorder.start();
                recBtn.classList.add('recording');
                playRecBtn.disabled = true;
                saveRecBtn.disabled = true;
                recBtn.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20"><rect fill="currentColor" x="6" y="6" width="12" height="12" rx="2"/></svg>';
            }
        });

        playRecBtn.addEventListener('click', () => {
            this.recorder.play();
        });

        saveRecBtn.addEventListener('click', () => {
            this.recorder.save();
            this.renderRecordings();
            saveRecBtn.disabled = true;
        });

        clearRecBtn.addEventListener('click', () => {
            this.recorder.clear();
            playRecBtn.disabled = true;
            saveRecBtn.disabled = true;
        });

        // Metronome
        const metroToggle = document.getElementById('metronome-toggle');
        const bpmInput = document.getElementById('bpm-input');
        
        metroToggle.addEventListener('change', () => {
            if (metroToggle.checked) {
                this.metronome.setBPM(bpmInput.value);
                this.metronome.start();
            } else {
                this.metronome.stop();
            }
        });

        bpmInput.addEventListener('input', () => {
            const val = bpmInput.value;
            this.metronome.setBPM(val);
            this.beatPlayer.bpm = parseInt(val);
        });

        // Song Mode
        const songSelect = document.getElementById('song-select');
        const songPlayBtn = document.getElementById('song-play-btn');

        songPlayBtn.addEventListener('click', async () => {
            if (this.songPlayer.isPlaying) {
                this.songPlayer.stop();
                songPlayBtn.classList.remove('playing');
                songPlayBtn.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>';
            } else {
                const songId = songSelect.value;
                if (songId !== 'none') {
                    // Apply presets
                    const p = this.presets.songs[songId];
                    if (p) {
                        if (p.octave) this.setOctave(p.octave);
                        if (p.tone) this.engine.setTone(p.tone);
                        if (p.beat) {
                            beatSelect.value = p.beat;
                            // Optionally start beat automatically? User didn't specify, let's just select it.
                        }
                    }

                    songPlayBtn.classList.add('playing');
                    songPlayBtn.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>';
                    await this.songPlayer.play(songId);
                    songPlayBtn.classList.remove('playing');
                    songPlayBtn.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>';
                }
            }
        });

        songSelect.addEventListener('change', () => {
            const songId = songSelect.value;
            if (songId !== 'none') {
                const p = this.presets.songs[songId];
                if (p) {
                    if (p.octave) this.setOctave(p.octave);
                    if (p.tone) this.engine.setTone(p.tone);
                    if (p.beat) beatSelect.value = p.beat;
                }
            }

            if (this.songPlayer.isPlaying) {
                this.songPlayer.stop();
                songPlayBtn.classList.remove('playing');
                songPlayBtn.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>';
            }
        });

        // Drum Beats
        const beatSelect = document.getElementById('beat-select');
        const beatToggle = document.getElementById('beat-toggle');
        
        beatToggle.addEventListener('click', () => {
            if (this.beatPlayer.isPlaying) {
                this.beatPlayer.stop();
                beatToggle.classList.remove('playing');
                beatToggle.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>';
            } else {
                const beatId = beatSelect.value;
                if (beatId !== 'none') {
                    // Apply presets for beats
                    const p = this.presets.beats[beatId];
                    if (p && p.tone) this.engine.setTone(p.tone);

                    this.beatPlayer.bpm = parseInt(bpmInput.value);
                    this.beatPlayer.start(beatId);
                    beatToggle.classList.add('playing');
                    beatToggle.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>';
                }
            }
        });

        beatSelect.addEventListener('change', () => {
            const beatId = beatSelect.value;
            if (beatId !== 'none') {
                const p = this.presets.beats[beatId];
                if (p && p.tone) this.engine.setTone(p.tone);
            }

            if (this.beatPlayer.isPlaying) {
                this.beatPlayer.start(beatId);
            }
        });

        // Fullscreen
        document.getElementById('fullscreen-btn').addEventListener('click', () => {
            if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen();
            } else {
                if (document.exitFullscreen) {
                    document.exitFullscreen();
                }
            }
        });
    }

    renderRecordings() {
        const list = document.getElementById('recordings-list');
        if (!list) return;
        
        const recordings = this.recorder.savedRecordings;
        
        if (recordings.length === 0) {
            list.innerHTML = '<p class="empty-msg">No recordings saved yet.</p>';
            return;
        }

        list.innerHTML = recordings.map(rec => `
            <div class="recording-item" data-id="${rec.id}">
                <div class="recording-info">
                    <span class="recording-name">${rec.name}</span>
                    <span class="recording-date">${rec.date}</span>
                </div>
                <div class="recording-actions">
                    <button class="icon-btn sm lib-play" title="Play">
                        <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>
                    </button>
                    <button class="icon-btn sm lib-delete" title="Delete">
                        <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zm3.17-10.33l1.41-1.41L12 8.59l1.42-1.42 1.41 1.41L13.41 10l1.42 1.42-1.41 1.41L12 11.41l-1.42 1.42-1.41-1.41L10.59 10l-1.42-1.42z"/></svg>
                    </button>
                </div>
            </div>
        `).join('');

        // Library Actions
        list.querySelectorAll('.lib-play').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const item = e.target.closest('.recording-item');
                const id = parseInt(item.dataset.id);
                const rec = recordings.find(r => r.id === id);
                if (rec) this.recorder.play(rec.sequence);
            });
        });

        list.querySelectorAll('.lib-delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const item = e.target.closest('.recording-item');
                const id = parseInt(item.dataset.id);
                if (confirm('Delete this recording?')) {
                    this.recorder.delete(id);
                    this.renderRecordings();
                }
            });
        });
    }
}

// Start the app
window.app = new App();
window.app.init();
