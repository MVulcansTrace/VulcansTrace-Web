export class ThemeSelector {
    constructor() {
        this.currentTheme = 'none';
        this.themes = {
            none: { name: 'None', icon: '○' },
            digitalRain: { name: 'Digital Rain', icon: '◈' },
            networkActivity: { name: 'Network Activity', icon: '◉' },
            radialScan: { name: 'Radial Scan', icon: '◎' },
            terminalGrid: { name: 'Terminal Grid', icon: '◇' },
            particleField: { name: 'Particle Field', icon: '∴' },
            waveInterference: { name: 'Wave Interference', icon: '〰' }
        };
        this.currentTheme = this.normalizeThemeKey(localStorage.getItem('vulcanstrace-theme') || 'none');
        this.init();
    }

    normalizeThemeKey(themeKey) {
        if (!themeKey || themeKey === 'none') {
            return 'none';
        }

        let normalized = themeKey;
        if (normalized.includes('-')) {
            normalized = normalized.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        }

        return this.themes[normalized] ? normalized : 'none';
    }

    init() {
        this.applyTheme(this.currentTheme);
    }

    createThemeSelector() {
        const themeContainer = document.createElement('div');
        themeContainer.style.cssText = `
            position: relative;
            display: inline-block;
        `;

        // Theme button
        this.themeButton = document.createElement('button');
        this.themeButton.className = 'btn btn-ghost';
        this.themeButton.innerHTML = `
            <svg class="icon" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z"/>
            </svg>
            Themes
            <span class="badge" style="margin-left: 4px; background: var(--accent-cyan); color: var(--bg-main);">1</span>
        `;
        this.themeButton.style.cssText = `
            position: relative;
        `;

        // Theme dropdown menu
        this.themeMenu = document.createElement('div');
        this.themeMenu.className = 'theme-menu';
        this.themeMenu.style.cssText = `
            position: absolute;
            top: 100%;
            right: 0;
            margin-top: 8px;
            background: var(--bg-panel);
            border: 1px solid var(--border);
            border-radius: 8px;
            box-shadow: var(--shadow-lg);
            min-width: 200px;
            z-index: 1000;
            display: none;
            animation: popIn 0.2s ease-out;
        `;

        this.populateThemeMenu();

        themeContainer.appendChild(this.themeButton);
        themeContainer.appendChild(this.themeMenu);

        // Event listeners
        this.themeButton.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleMenu();
        });

        document.addEventListener('click', () => {
            this.hideMenu();
        });

        this.themeMenu.addEventListener('click', (e) => {
            e.stopPropagation();
        });

        return themeContainer;
    }

    populateThemeMenu() {
        this.themeMenu.innerHTML = '';

        Object.entries(this.themes).forEach(([key, theme]) => {
            const menuItem = document.createElement('div');
            menuItem.className = 'theme-menu-item';
            menuItem.style.cssText = `
                padding: 10px 16px;
                cursor: pointer;
                display: flex;
                align-items: center;
                gap: 10px;
                transition: all 0.2s;
                font-size: 0.85rem;
                position: relative;
            `;

            if (key === this.currentTheme) {
                menuItem.style.cssText += `
                    background: rgba(6, 182, 212, 0.1);
                    color: var(--accent-cyan);
                `;
            }

            menuItem.innerHTML = `
                <span style="font-size: 1.2rem; opacity: 0.7;">${theme.icon}</span>
                <span>${theme.name}</span>
                ${key === this.currentTheme ? '<span style="margin-left: auto; color: var(--accent-cyan);">✓</span>' : ''}
            `;

            menuItem.addEventListener('mouseenter', () => {
                if (key !== this.currentTheme) {
                    menuItem.style.background = 'rgba(255, 255, 255, 0.05)';
                }
            });

            menuItem.addEventListener('mouseleave', () => {
                if (key !== this.currentTheme) {
                    menuItem.style.background = 'transparent';
                }
            });

            menuItem.addEventListener('click', () => {
                this.selectTheme(key);
            });

            this.themeMenu.appendChild(menuItem);
        });
    }

    toggleMenu() {
        if (this.themeMenu.style.display === 'block') {
            this.hideMenu();
        } else {
            this.showMenu();
        }
    }

    showMenu() {
        this.themeMenu.style.display = 'block';
    }

    hideMenu() {
        this.themeMenu.style.display = 'none';
    }

    selectTheme(themeKey) {
        this.currentTheme = themeKey;
        localStorage.setItem('vulcanstrace-theme', themeKey);
        this.applyTheme(themeKey);
        this.populateThemeMenu();
        this.hideMenu();

        // Update badge
        const badge = this.themeButton.querySelector('.badge');
        if (themeKey !== 'none') {
            badge.textContent = '✦';
            badge.style.background = 'var(--accent-purple)';
        } else {
            badge.textContent = '1';
            badge.style.background = 'var(--accent-cyan)';
        }
    }

    applyTheme(themeKey) {
        const normalizedThemeKey = this.normalizeThemeKey(themeKey);
        if (normalizedThemeKey !== themeKey) {
            themeKey = normalizedThemeKey;
            this.currentTheme = themeKey;
            localStorage.setItem('vulcanstrace-theme', themeKey);
        }

        this.destroy();

        // Remove existing theme classes
        document.body.classList.remove(
            'theme-digitalRain',
            'theme-networkActivity',
            'theme-radialScan',
            'theme-terminalGrid',
            'theme-particleField',
            'theme-waveInterference',
            // Legacy kebab-case cleanup
            'theme-digital-rain',
            'theme-network-activity',
            'theme-radial-scan',
            'theme-terminal-grid',
            'theme-particle-field',
            'theme-wave-interference'
        );

        // Remove existing theme elements
        const existingCanvas = document.getElementById('theme-canvas');
        if (existingCanvas) {
            existingCanvas.remove();
        }

        // Apply new theme
        if (themeKey !== 'none') {
            document.body.classList.add(`theme-${themeKey}`);
            this.initializeTheme(themeKey);
        }
    }

    initializeTheme(themeKey) {
        switch (themeKey) {
            case 'digitalRain':
                this.createDigitalRain();
                break;
            case 'networkActivity':
                this.createNetworkActivity();
                break;
            case 'radialScan':
                this.createRadialScan();
                break;
            case 'terminalGrid':
                this.createTerminalGrid();
                break;
            case 'particleField':
                this.createParticleField();
                break;
            case 'waveInterference':
                this.createWaveInterference();
                break;
        }
    }

    createDigitalRain() {
        const canvas = this.createCanvas();
        const ctx = canvas.getContext('2d');
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#$%^&*()';
        const fontSize = 14;
        const columns = Math.floor(canvas.width / fontSize);
        const drops = new Array(columns).fill(1);

        function draw() {
            ctx.fillStyle = 'rgba(15, 23, 42, 0.05)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            ctx.fillStyle = '#06b6d4';
            ctx.font = `${fontSize}px monospace`;

            for (let i = 0; i < drops.length; i++) {
                const text = chars[Math.floor(Math.random() * chars.length)];
                ctx.fillText(text, i * fontSize, drops[i] * fontSize);

                if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) {
                    drops[i] = 0;
                }
                drops[i]++;
            }
        }

        this.animationFrame = setInterval(draw, 35);
    }

    createNetworkActivity() {
        const canvas = this.createCanvas();
        const ctx = canvas.getContext('2d');
        const nodes = [];
        const connections = [];
        const nodeCount = 8;

        // Create nodes
        for (let i = 0; i < nodeCount; i++) {
            nodes.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                vx: (Math.random() - 0.5) * 0.5,
                vy: (Math.random() - 0.5) * 0.5,
                radius: Math.random() * 3 + 2
            });
        }

        // Create connections
        for (let i = 0; i < nodeCount; i++) {
            for (let j = i + 1; j < nodeCount; j++) {
                if (Math.random() > 0.7) {
                    connections.push({
                        from: i,
                        to: j,
                        progress: Math.random()
                    });
                }
            }
        }

        function draw() {
            ctx.fillStyle = 'rgba(15, 23, 42, 0.1)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Update and draw connections
            connections.forEach(conn => {
                conn.progress += 0.01;
                if (conn.progress > 1) conn.progress = 0;

                const from = nodes[conn.from];
                const to = nodes[conn.to];
                const x = from.x + (to.x - from.x) * conn.progress;
                const y = from.y + (to.y - from.y) * conn.progress;

                ctx.beginPath();
                ctx.arc(x, y, 2, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(6, 182, 212, 0.5)';
                ctx.fill();
            });

            // Draw static connections
            ctx.strokeStyle = 'rgba(6, 182, 212, 0.1)';
            ctx.lineWidth = 1;
            connections.forEach(conn => {
                const from = nodes[conn.from];
                const to = nodes[conn.to];
                ctx.beginPath();
                ctx.moveTo(from.x, from.y);
                ctx.lineTo(to.x, to.y);
                ctx.stroke();
            });

            // Update and draw nodes
            nodes.forEach(node => {
                node.x += node.vx;
                node.y += node.vy;

                if (node.x < 0 || node.x > canvas.width) node.vx *= -1;
                if (node.y < 0 || node.y > canvas.height) node.vy *= -1;

                ctx.beginPath();
                ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(6, 182, 212, 0.3)';
                ctx.fill();
            });
        }

        this.animationFrame = setInterval(draw, 30);
    }

    createRadialScan() {
        const canvas = this.createCanvas();
        const ctx = canvas.getContext('2d');
        const scanLines = [
            { angle: 0, speed: 0.02, center: { x: 0, y: 0 } },
            { angle: Math.PI / 2, speed: 0.015, center: { x: canvas.width, y: 0 } },
            { angle: Math.PI, speed: 0.025, center: { x: canvas.width, y: canvas.height } },
            { angle: Math.PI * 1.5, speed: 0.018, center: { x: 0, y: canvas.height } }
        ];

        function draw() {
            ctx.fillStyle = 'rgba(15, 23, 42, 0.05)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            scanLines.forEach(scan => {
                scan.angle += scan.speed;

                const gradient = ctx.createLinearGradient(
                    scan.center.x,
                    scan.center.y,
                    scan.center.x + Math.cos(scan.angle) * 400,
                    scan.center.y + Math.sin(scan.angle) * 400
                );
                gradient.addColorStop(0, 'rgba(6, 182, 212, 0.2)');
                gradient.addColorStop(0.5, 'rgba(6, 182, 212, 0.1)');
                gradient.addColorStop(1, 'rgba(6, 182, 212, 0)');

                ctx.strokeStyle = gradient;
                ctx.lineWidth = 40;
                ctx.beginPath();
                ctx.moveTo(scan.center.x, scan.center.y);
                ctx.lineTo(
                    scan.center.x + Math.cos(scan.angle) * 600,
                    scan.center.y + Math.sin(scan.angle) * 600
                );
                ctx.stroke();
            });
        }

        this.animationFrame = setInterval(draw, 30);
    }

    createTerminalGrid() {
        const canvas = this.createCanvas();
        const ctx = canvas.getContext('2d');
        const gridSize = 30;
        let time = 0;

        function draw() {
            ctx.fillStyle = 'rgba(15, 23, 42, 0.08)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            ctx.strokeStyle = 'rgba(6, 182, 212, 0.1)';
            ctx.lineWidth = 1;

            // Vertical lines
            for (let x = 0; x < canvas.width; x += gridSize) {
                const offset = Math.sin(time + x * 0.01) * 5;
                ctx.beginPath();
                ctx.moveTo(x + offset, 0);
                ctx.lineTo(x + offset, canvas.height);
                ctx.stroke();
            }

            // Horizontal lines
            for (let y = 0; y < canvas.height; y += gridSize) {
                const offset = Math.cos(time + y * 0.01) * 5;
                ctx.beginPath();
                ctx.moveTo(0, y + offset);
                ctx.lineTo(canvas.width, y + offset);
                ctx.stroke();
            }

            // Hexagon overlay
            const hexSize = 50;
            for (let x = 0; x < canvas.width; x += hexSize * 3) {
                for (let y = 0; y < canvas.height; y += hexSize * 2.6) {
                    const alpha = (Math.sin(time + x * 0.005 + y * 0.005) + 1) * 0.05;
                    ctx.strokeStyle = `rgba(6, 182, 212, ${alpha})`;
                    this.drawHexagon(ctx, x, y, hexSize);
                }
            }

            time += 0.02;
        }

        this.drawHexagon = function (ctx, x, y, size) {
            ctx.beginPath();
            for (let i = 0; i < 6; i++) {
                const angle = (Math.PI / 3) * i;
                const hx = x + size * Math.cos(angle);
                const hy = y + size * Math.sin(angle);
                if (i === 0) ctx.moveTo(hx, hy);
                else ctx.lineTo(hx, hy);
            }
            ctx.closePath();
            ctx.stroke();
        };

        this.animationFrame = setInterval(draw, 30);
    }

    createParticleField() {
        const canvas = this.createCanvas();
        const ctx = canvas.getContext('2d');
        const particles = [];
        const particleCount = 100;
        let mouseX = 0;
        let mouseY = 0;

        for (let i = 0; i < particleCount; i++) {
            particles.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                vx: (Math.random() - 0.5) * 0.5,
                vy: (Math.random() - 0.5) * 0.5,
                radius: Math.random() * 2 + 1,
                opacity: Math.random() * 0.5 + 0.2
            });
        }

        document.addEventListener('mousemove', (e) => {
            mouseX = e.clientX;
            mouseY = e.clientY;
        });

        function draw() {
            ctx.fillStyle = 'rgba(15, 23, 42, 0.1)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            particles.forEach(particle => {
                // Mouse interaction
                const dx = mouseX - particle.x;
                const dy = mouseY - particle.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < 100) {
                    const force = (100 - dist) / 100;
                    particle.vx -= (dx / dist) * force * 0.1;
                    particle.vy -= (dy / dist) * force * 0.1;
                }

                particle.x += particle.vx;
                particle.y += particle.vy;
                particle.vx *= 0.99;
                particle.vy *= 0.99;

                if (particle.x < 0 || particle.x > canvas.width) particle.vx *= -1;
                if (particle.y < 0 || particle.y > canvas.height) particle.vy *= -1;

                ctx.beginPath();
                ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(6, 182, 212, ${particle.opacity})`;
                ctx.fill();
            });
        }

        this.animationFrame = setInterval(draw, 30);
    }

    createWaveInterference() {
        const canvas = this.createCanvas();
        const ctx = canvas.getContext('2d');
        let time = 0;

        // OPTIMIZATION 1: Increase grid step (10 -> 25)
        // This reduces draw calls from ~20,000 to ~3,000 (85% reduction)
        const gridSize = 25;

        const waves = [
            { amplitude: 30, frequency: 0.02, speed: 0.03, phase: 0 },
            { amplitude: 20, frequency: 0.03, speed: 0.02, phase: Math.PI / 3 },
            { amplitude: 25, frequency: 0.025, speed: 0.025, phase: Math.PI * 2 / 3 }
        ];

        // OPTIMIZATION 2: Pre-calculate distances (Look-Up Table)
        // We only calculate Math.sqrt once per grid point, not every frame.
        let distMap = [];

        const cacheDistances = () => {
            distMap = [];
            for (let x = 0; x < canvas.width; x += gridSize) {
                const row = [];
                for (let y = 0; y < canvas.height; y += gridSize) {
                    row.push(Math.sqrt(
                        Math.pow(x - canvas.width / 2, 2) +
                        Math.pow(y - canvas.height / 2, 2)
                    ));
                }
                distMap.push(row);
            }
        };

        // Init cache and update on resize
        cacheDistances();
        window.addEventListener('resize', cacheDistances);

        const draw = () => {
            // Use clearRect instead of fillRect for background (faster)
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = 'rgba(15, 23, 42, 0.08)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Draw wave lines (Optional: skipped for pure performance, or keep if desired)

            // Optimized Interference Pattern
            let xi = 0;
            for (let x = 0; x < canvas.width; x += gridSize) {
                let yi = 0;
                for (let y = 0; y < canvas.height; y += gridSize) {
                    let intensity = 0;

                    // Use cached distance
                    const dist = distMap[xi] && distMap[xi][yi] ? distMap[xi][yi] : 0;

                    for (let w = 0; w < waves.length; w++) {
                        const wave = waves[w];
                        intensity += Math.sin(dist * 0.02 - time * 0.05) * wave.amplitude;
                    }

                    const alpha = Math.abs(Math.sin(intensity * 0.1)) * 0.1;

                    // Only draw if visible enough to matter
                    if (alpha > 0.01) {
                        ctx.fillStyle = `rgba(6, 182, 212, ${alpha})`;
                        ctx.fillRect(x, y, gridSize - 2, gridSize - 2);
                    }
                    yi++;
                }
                xi++;
            }

            time += 1;

            // OPTIMIZATION 3: Use requestAnimationFrame instead of setInterval
            this.animationFrame = requestAnimationFrame(draw);
        };

        draw();
    }

    createCanvas() {
        const canvas = document.createElement('canvas');
        canvas.id = 'theme-canvas';
        canvas.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 0;
            opacity: 0.7;
        `;
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;

        document.body.insertBefore(canvas, document.body.firstChild);

        if (this._resizeHandler) {
            window.removeEventListener('resize', this._resizeHandler);
        }
        this._resizeHandler = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        };
        window.addEventListener('resize', this._resizeHandler);

        return canvas;
    }

    destroy() {
        if (this.animationFrame) {
            clearInterval(this.animationFrame);
            cancelAnimationFrame(this.animationFrame);
            this.animationFrame = null;
        }
        if (this._resizeHandler) {
            window.removeEventListener('resize', this._resizeHandler);
            this._resizeHandler = null;
        }
        const canvas = document.getElementById('theme-canvas');
        if (canvas) {
            canvas.remove();
        }
    }
}
