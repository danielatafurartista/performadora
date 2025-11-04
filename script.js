'use strict';

(function () {
    const REEL_SOURCES = ['./data/reel1.json', './data/reel2.json', './data/reel3.json'];
    const SLOTS_PER_REEL = 12;
    const REEL_RADIUS = 180;

    const DEFAULT_SYMBOL = {
        id: 'placeholder',
        label: 'WAITING',
        text: '...',
        weight: 1
    };

    function getSeed() {
        return Math.floor(Math.random() * SLOTS_PER_REEL);
    }

    class Reel3D {
        constructor(element, symbols, index) {
            this.element = element;
            this.symbols = Array.isArray(symbols) && symbols.length ? symbols : [DEFAULT_SYMBOL];
            this.index = index;
            this.currentRotation = 0;
            this.isSpinning = false;

            this.windowEl = document.createElement('div');
            this.windowEl.className = 'reel-window';

            this.cylinderEl = document.createElement('div');
            this.cylinderEl.className = 'reel-cylinder';

            this.windowEl.appendChild(this.cylinderEl);
            this.element.appendChild(this.windowEl);

            this.createSlots();
        }

        createSlots() {
            const slotAngle = 360 / SLOTS_PER_REEL;
            const seed = getSeed();

            for (let i = 0; i < SLOTS_PER_REEL; i++) {
                const slot = document.createElement('div');
                slot.className = 'slot';

                const symbolIndex = (seed + i) % this.symbols.length;
                const symbol = this.symbols[symbolIndex];

                const rotateX = slotAngle * i;
                const transform = `rotateX(${rotateX}deg) translateZ(${REEL_RADIUS}px)`;
                slot.style.transform = transform;

                const textSpan = document.createElement('span');
                textSpan.className = 'symbol-text';
                textSpan.textContent = symbol.text || symbol.label || DEFAULT_SYMBOL.text;

                slot.appendChild(textSpan);
                slot.dataset.symbolId = symbol.id;

                this.cylinderEl.appendChild(slot);
            }
        }

        getCurrentSymbol() {
            const normalizedRotation = ((this.currentRotation % 360) + 360) % 360;
            const slotAngle = 360 / SLOTS_PER_REEL;
            const slotIndex = Math.round(normalizedRotation / slotAngle) % SLOTS_PER_REEL;

            const slots = this.cylinderEl.querySelectorAll('.slot');
            if (slots[slotIndex]) {
                const symbolId = slots[slotIndex].dataset.symbolId;
                return this.symbols.find(s => s.id === symbolId) || DEFAULT_SYMBOL;
            }
            return DEFAULT_SYMBOL;
        }

        spin(targetSymbol, duration) {
            if (this.isSpinning) return Promise.resolve(targetSymbol);

            this.isSpinning = true;
            this.element.classList.add('spinning');

            return new Promise((resolve) => {
                const slotAngle = 360 / SLOTS_PER_REEL;

                const slots = Array.from(this.cylinderEl.querySelectorAll('.slot'));
                const targetSlotIndex = slots.findIndex(slot => slot.dataset.symbolId === targetSymbol.id);

                let finalSlotIndex = targetSlotIndex >= 0 ? targetSlotIndex : 0;

                // Normalize current rotation to prevent accumulation
                const normalizedCurrent = this.currentRotation % 360;
                const fullRotations = 10 + this.index;
                const targetRotation = -(fullRotations * 360 + finalSlotIndex * slotAngle);

                const keyframeName = `spin-reel-${this.index}-${Date.now()}`;
                const keyframes = `
          @keyframes ${keyframeName} {
            0% { transform: translateX(-50%) translateY(-50%) rotateX(${normalizedCurrent}deg); }
            100% { transform: translateX(-50%) translateY(-50%) rotateX(${targetRotation}deg); }
          }
        `;

                const styleSheet = document.createElement('style');
                styleSheet.textContent = keyframes;
                document.head.appendChild(styleSheet);

                this.cylinderEl.style.animation = `${keyframeName} ${duration}s cubic-bezier(0.25, 0.1, 0.25, 1)`;

                setTimeout(() => {
                    // Store normalized rotation to prevent huge numbers
                    this.currentRotation = -(finalSlotIndex * slotAngle);
                    this.cylinderEl.style.animation = '';
                    this.cylinderEl.style.transform = `translateX(-50%) translateY(-50%) rotateX(${this.currentRotation}deg)`;
                    this.isSpinning = false;
                    this.element.classList.remove('spinning');

                    document.head.removeChild(styleSheet);

                    resolve(targetSymbol);
                }, duration * 1000);
            });
        }

        setHighlight(active) {
            this.element.classList.toggle('reel-win', Boolean(active));
        }
    }

    class SlotMachine {
        constructor(options) {
            this.reelEls = options.reelEls || [];
            this.spinButton = options.spinButton;
            this.messageEl = options.messageEl;

            this.reels = [];
            this.isSpinning = false;
        }

        async init() {
            this.setMessage('Loading...', 'pending');

            try {
                const reelsData = await this.loadReelData();
                this.reels = this.reelEls.map((element, index) => new Reel3D(element, reelsData[index] || [], index));
                this.bindEvents();
                this.setMessage('Press SPIN to generate!', 'ready');
            } catch (error) {
                console.error(error);
                this.setMessage('Failed to load. Serve with local server (e.g., npx serve)', 'loss');
            }
        }

        async loadReelData() {
            const responses = await Promise.all(
                REEL_SOURCES.map((source) =>
                    fetch(source).then((response) => {
                        if (!response.ok) {
                            throw new Error(`Failed to load ${source}`);
                        }
                        return response.json();
                    })
                )
            );

            return responses.map((payload) => {
                if (!payload || !Array.isArray(payload.reel)) {
                    return [DEFAULT_SYMBOL];
                }
                return payload.reel;
            });
        }

        bindEvents() {
            if (this.spinButton) {
                this.spinButton.addEventListener('click', () => {
                    this.spinOnce();
                });
            }
        }

        async spinOnce() {
            if (this.isSpinning) {
                return null;
            }

            this.isSpinning = true;
            this.clearHighlights();
            this.spinButton && (this.spinButton.disabled = true);
            this.setMessage('Generating...', 'pending');

            const chosenSymbols = this.reels.map((reel) => this.pickWeightedSymbol(reel.symbols));

            try {
                const durations = [2.5, 3.0, 3.5];
                const results = await Promise.all(
                    this.reels.map((reel, index) => reel.spin(chosenSymbols[index], durations[index]))
                );
                this.handleResults(results);
                return results;
            } finally {
                this.isSpinning = false;
                if (this.spinButton) {
                    this.spinButton.disabled = false;
                }
            }
        }

        handleResults(results) {
            const bodyPart = results[0]?.text || results[0]?.label || '?';
            const action = results[1]?.text || results[1]?.label || '?';
            const place = results[2]?.text || results[2]?.label || '?';

            const message = `${bodyPart} ${action} ${place}`;
            this.setMessage(message, 'win');
        }

        pickWeightedSymbol(symbols) {
            const totalWeight = symbols.reduce((sum, symbol) => sum + (Number(symbol.weight) || 1), 0);
            let threshold = Math.random() * totalWeight;

            for (let i = 0; i < symbols.length; i++) {
                const weight = Number(symbols[i].weight) || 1;
                threshold -= weight;
                if (threshold <= 0) {
                    return symbols[i];
                }
            }

            return symbols[symbols.length - 1] || DEFAULT_SYMBOL;
        }

        clearHighlights() {
            this.reels.forEach((reel) => reel.setHighlight(false));
        }

        setMessage(message, state) {
            if (!this.messageEl) {
                return;
            }

            this.messageEl.textContent = message;
            this.messageEl.classList.remove('win', 'loss', 'pending', 'ready');

            if (state === 'win') {
                this.messageEl.classList.add('win');
            } else if (state === 'loss') {
                this.messageEl.classList.add('loss');
            }
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        const slotMachine = new SlotMachine({
            reelEls: Array.from(document.querySelectorAll('.reel')),
            spinButton: document.getElementById('spinButton'),
            messageEl: document.getElementById('messageArea')
        });

        slotMachine.init();
        window.slotMachine = slotMachine;
    });
})();
