// Standard aspect ratios
        const ratios = [
            { name: "16:9", value: 16 / 9 },
            //{ name: "4:3", value: 4 / 3 }
        ];
        function getNearestRatio(width, height) {
            const actual = width / height;
            let nearest = ratios[0];
            let minDiff = Math.abs(actual - nearest.value);
            for (const r of ratios) {
                const diff = Math.abs(actual - r.value);
                if (diff < minDiff) {
                    minDiff = diff;
                    nearest = r;
                }
            }
            return nearest;
        }
        function setAspectBox() {
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            const nearest = getNearestRatio(vw, vh);
            // Calculate max box size that fits in viewport while maintaining aspect ratio
            let boxW = vw;
            let boxH = boxW / nearest.value;
            if (boxH > vh) {
                boxH = vh;
                boxW = boxH * nearest.value;
            }

            const box = document.getElementById('aspect-box');
            box.style.width = boxW + 'px';
            box.style.height = boxH + 'px';
            console.log(`Aspect Ratio: ${nearest.name} (${nearest.value.toFixed(2)})`);
            if (nearest.name === "16:9") {
                document.getElementById('sixteenbynine').style.visibility = 'visible';
            } else {
                document.getElementById('sixteenbynine').style.visibility = 'hidden';
            }
        }
        window.addEventListener('resize', setAspectBox);
        setAspectBox();

        const container = document.getElementsByClassName('hand')[0];

        function dynamicHandSize() {
            const handCards = container.getElementsByClassName('card');
            const cardCount = handCards.length;
            if (cardCount > 7) {
                container.style.justifyContent = 'flex-start';
                container.scrollLeft = (container.scrollWidth - container.clientWidth) / 2;
            } else {
                container.style.justifyContent = 'center';
            }
        }
        const observer = new MutationObserver(() => {
            dynamicHandSize();
        });
        observer.observe(container, { childList: true });
        dynamicHandSize();
        window.addEventListener('resize', dynamicHandSize);
        const hand = document.querySelector('#sixteenbynine .hand');

        let targetScrollX = 0;
        let currentScrollX = 0;
        let isAnimating = false;
        const smoothFactor = 0.1; // smaller = smoother

        const lerp = (a, b, t) => a + (b - a) * t;

        function animate() {
            currentScrollX = lerp(currentScrollX, targetScrollX, smoothFactor);
            hand.scrollLeft = currentScrollX;

            if (Math.abs(targetScrollX - currentScrollX) > 0.5) {
                requestAnimationFrame(animate);
            } else {
                isAnimating = false;
            }
        }

        // wheel → horizontal
        hand.addEventListener('wheel', (e) => {
            e.preventDefault();
            targetScrollX += e.deltaY; // map vertical to horizontal
            if (targetScrollX < 0) targetScrollX = 0;
            if (targetScrollX > hand.scrollWidth - hand.clientWidth) targetScrollX = hand.scrollWidth - hand.clientWidth;
            if (!isAnimating) {
                isAnimating = true;
                requestAnimationFrame(animate);
            }
        }, { passive: false });

        // optional drag
        let isDown = false;
        let startX = 0;

        hand.addEventListener('mousedown', (e) => {
            isDown = true;
            startX = e.pageX;
        });
        document.addEventListener('mouseup', () => { isDown = false; });
        document.addEventListener('mousemove', (e) => {
            if (!isDown) return;
            e.preventDefault();
            const dx = startX - e.pageX;
            targetScrollX += dx * 0.5;
            startX = e.pageX;
            if (!isAnimating) {
                isAnimating = true;
                requestAnimationFrame(animate);
            }
            if (targetScrollX < 0) targetScrollX = 0;
            if (targetScrollX > hand.scrollWidth - hand.clientWidth) targetScrollX = hand.scrollWidth - hand.clientWidth;
        });

        if (navigator.userAgent.toLowerCase().indexOf('firefox') > -1) {
            //          document.getElementById('sixteenbynine').style.visibility = 'hidden';
            //  alert("This page does not support Firefox due to its handling of certain CSS properties.");
            //window.close();
        }