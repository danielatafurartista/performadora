'use strict';

(function () {
    const REEL_SOURCES = ['./data/reel1.json', './data/reel2.json', './data/reel3.json'];
    const REEL_RADIUS = 180;

    const DEFAULT_SYMBOL = {
        id: 'placeholder',
        label: 'WAITING',
        text: '...',
        weight: 1
    };

    function getSecureRandom() {
        if (typeof window !== 'undefined' && window.crypto && typeof window.crypto.getRandomValues === 'function') {
            const buffer = new Uint32Array(1);
            window.crypto.getRandomValues(buffer);
            return buffer[0] / 0x100000000;
        }
        return Math.random();
    }

    function getRandomInt(max) {
        if (!Number.isFinite(max) || max <= 0) {
            return 0;
        }
        return Math.floor(getSecureRandom() * max);
    }

    function getSeed(limit) {
        return getRandomInt(limit);
    }

    function normalizeReelEntries(reelEntries) {
        if (!Array.isArray(reelEntries)) {
            return [DEFAULT_SYMBOL];
        }

        const normalized = reelEntries
            .map((entry, index) => {
                if (typeof entry === 'string') {
                    const text = entry.trim();
                    if (!text) {
                        return null;
                    }

                    const id =
                        text
                            .toLowerCase()
                            .normalize('NFD')
                            .replace(/[\u0300-\u036f]/g, '')
                            .replace(/[^a-z0-9]+/g, '-')
                            .replace(/^-+|-+$/g, '') || `symbol-${index}`;

                    return {
                        id,
                        label: text,
                        text,
                        weight: 1
                    };
                }

                if (entry && typeof entry === 'object') {
                    return entry;
                }

                return null;
            })
            .filter(Boolean);

        return normalized.length ? normalized : [DEFAULT_SYMBOL];
    }

    class Reel3D {
        constructor(element, symbols, index) {
            this.element = element;
            this.symbols = Array.isArray(symbols) && symbols.length ? symbols : [DEFAULT_SYMBOL];
            this.index = index;
            this.totalSymbols = this.symbols.length;
            this.slotCount = Math.min(this.totalSymbols || 1, 10);
            this.visibleIndexes = [];
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

        createSlots(startIndex) {
            this.cylinderEl.innerHTML = '';
            this.visibleIndexes = [];

            if (!this.slotCount) {
                return;
            }

            const slotAngle = 360 / this.slotCount;
            const start = Number.isFinite(startIndex) ? this.wrapIndex(startIndex) : this.wrapIndex(getSeed(Math.max(this.totalSymbols, 1)));

            for (let i = 0; i < this.slotCount; i++) {
                const slot = document.createElement('div');
                slot.className = 'slot';

                const symbolIndex = this.wrapIndex(start + i);
                const symbol = this.symbols[symbolIndex] || DEFAULT_SYMBOL;

                const rotateX = slotAngle * i;
                const transform = `rotateX(${rotateX}deg) translateZ(${REEL_RADIUS}px)`;
                slot.style.transform = transform;

                const textSpan = document.createElement('span');
                textSpan.className = 'symbol-text';
                textSpan.textContent = symbol.text || symbol.label || DEFAULT_SYMBOL.text;

                slot.appendChild(textSpan);
                slot.dataset.symbolId = symbol.id;
                slot.dataset.symbolIndex = String(symbolIndex);

                this.cylinderEl.appendChild(slot);
                this.visibleIndexes.push(symbolIndex);
            }
        }

        getCurrentSymbol() {
            if (!this.slotCount) {
                return DEFAULT_SYMBOL;
            }

            const slotAngle = 360 / this.slotCount;
            const rawIndex = Math.round(-this.currentRotation / slotAngle);
            const slotIndex = ((rawIndex % this.slotCount) + this.slotCount) % this.slotCount;

            const slots = this.cylinderEl.querySelectorAll('.slot');
            if (slots[slotIndex]) {
                const symbolIdx = this.visibleIndexes[slotIndex];
                if (symbolIdx !== undefined && this.symbols[symbolIdx]) {
                    return this.symbols[symbolIdx];
                }
            }
            return DEFAULT_SYMBOL;
        }

        spin(targetSymbol, duration) {
            if (this.isSpinning) return Promise.resolve(this.getCurrentSymbol());
            if (!this.slotCount) return Promise.resolve(this.getCurrentSymbol());

            this.isSpinning = true;
            this.element.classList.add('spinning');

            return new Promise((resolve) => {
                const slotAngle = 360 / this.slotCount;

                const targetIndex = this.resolveSymbolIndex(targetSymbol);
                const finalSlotIndex = getRandomInt(this.slotCount);
                this.setWindowForTarget(targetIndex, finalSlotIndex);
                this.cylinderEl.style.transform = `translateX(-50%) translateY(-50%) rotateX(${this.currentRotation}deg)`;

                // Normalize current rotation to prevent accumulation
                const normalizedCurrent = this.currentRotation % 360;
                const extraRotations = getRandomInt(6);
                const fullRotations = 10 + this.index + extraRotations;
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

                    resolve(this.getCurrentSymbol());
                }, duration * 1000);
            });
        }

        resolveSymbolIndex(symbol) {
            if (!symbol) {
                return this.visibleIndexes[0] ?? 0;
            }

            const directIndex = this.symbols.indexOf(symbol);
            if (directIndex >= 0) {
                return directIndex;
            }

            if (symbol.id) {
                const byId = this.symbols.findIndex((item) => item.id === symbol.id);
                if (byId >= 0) {
                    return byId;
                }
            }

            return this.visibleIndexes[0] ?? 0;
        }

        setWindowForTarget(targetIndex, finalSlotIndex) {
            if (!this.totalSymbols || !this.slotCount) {
                return;
            }

            const normalizedTarget = this.wrapIndex(targetIndex);
            const normalizedSlot = Math.max(0, Math.min(this.slotCount - 1, finalSlotIndex));
            const startIndex = this.wrapIndex(normalizedTarget - normalizedSlot);

            this.createSlots(startIndex);
        }

        wrapIndex(value) {
            const modulus = this.totalSymbols || 1;
            return ((value % modulus) + modulus) % modulus;
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
            this.notificationEl = options.notificationEl;
            this.notificationBodyEl = options.notificationBodyEl;
            this.questionsSectionEl = options.questionsSectionEl;
            this.closeNotificationBtn = options.closeNotificationBtn;
            this.nextStepButton = options.nextStepButton;

            this.reels = [];
            this.isSpinning = false;
            this.currentStep = 1;
        }

        async init() {
            this.setMessage('Loading...', 'pending');

            try {
                const reelsData = await this.loadReelData();
                this.reels = this.reelEls.map((element, index) => new Reel3D(element, reelsData[index] || [], index));
                this.bindEvents();
                this.setMessage('Presiona el botón para generar!', 'ready');
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

            return responses.map((payload) => normalizeReelEntries(payload?.reel));
        }

        bindEvents() {
            if (this.spinButton) {
                this.spinButton.addEventListener('click', () => {
                    this.spinOnce();
                });
            }

            if (this.closeNotificationBtn) {
                this.closeNotificationBtn.addEventListener('click', () => {
                    this.hideNotification();
                });
            }

            if (this.nextStepButton) {
                this.nextStepButton.addEventListener('click', () => {
                    this.nextStep();
                });
            }

            // Close notification when clicking outside
            if (this.notificationEl) {
                this.notificationEl.addEventListener('click', (e) => {
                    if (e.target === this.notificationEl) {
                        this.hideNotification();
                    }
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
            this.setMessage('Generando...', 'pending');

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

            // Show popup after 2 seconds
            setTimeout(() => {
                this.showNotification(bodyPart, action, place);
            }, 2000);
        }

        showNotification(bodyPart, action, place) {
            if (!this.notificationEl || !this.notificationBodyEl || !this.questionsSectionEl) {
                return;
            }

            // Reset to step 1
            this.currentStep = 1;
            this.showStep(1);

            const prompt = `${bodyPart} ${action} ${place}`;
            this.notificationBodyEl.textContent = prompt;

            // Generate questions with injected values
            const questions = [
                `¿Que significa ${bodyPart.toLowerCase()} para ti?`,
                `¿Que emociones o memorias guarda ${bodyPart.toLowerCase()}?`,
                `¿Como resuena esta parte del cuerpo con el gesto (${action.toLowerCase()})?`,
                `¿Que implica hacer esto ${place.toLowerCase()}?`
            ];

            this.questionsSectionEl.innerHTML = questions.map((q, index) =>
                `<div class="question-item">${q}</div>`
            ).join('');

            // Update button text
            if (this.nextStepButton) {
                this.nextStepButton.textContent = 'Siguiente';
            }

            this.notificationEl.classList.add('visible');
        }

        showStep(stepNumber) {
            // Hide all steps
            const steps = this.notificationEl.querySelectorAll('.step-view');
            steps.forEach(step => {
                step.style.display = 'none';
            });

            // Show the current step
            const currentStepEl = this.notificationEl.querySelector(`#step${stepNumber}`);
            if (currentStepEl) {
                currentStepEl.style.display = 'block';
            }
        }

        nextStep() {
            if (this.currentStep < 3) {
                this.currentStep++;
                this.showStep(this.currentStep);

                // Update button text for step 3
                if (this.currentStep === 3 && this.nextStepButton) {
                    this.nextStepButton.textContent = 'Cerrar';
                }
            } else {
                // Step 3: Close the notification
                this.hideNotification();
            }
        }

        hideNotification() {
            if (this.notificationEl) {
                this.notificationEl.classList.remove('visible');
                // Reset to step 1 for next time
                this.currentStep = 1;
                this.showStep(1);
                if (this.nextStepButton) {
                    this.nextStepButton.textContent = 'Siguiente';
                }
            }
        }

        pickWeightedSymbol(symbols) {
            const totalWeight = symbols.reduce((sum, symbol) => sum + (Number(symbol.weight) || 1), 0);
            let threshold = getSecureRandom() * totalWeight;

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
            messageEl: document.getElementById('messageArea'),
            notificationEl: document.getElementById('notification'),
            notificationBodyEl: document.getElementById('notificationBody'),
            questionsSectionEl: document.getElementById('questionsSection'),
            closeNotificationBtn: document.getElementById('closeNotification'),
            nextStepButton: document.getElementById('nextStepButton')
        });

        slotMachine.init();
        window.slotMachine = slotMachine;
    });
})();
