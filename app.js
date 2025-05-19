// Sound mute button
let soundMuted = localStorage.getItem('synthai_muted') === 'true';
let chime;

function playChime() {
    if (!chime) {
        // Simple sine wave chime
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'triangle';
        o.frequency.value = 740;
        o.connect(g);
        g.connect(ctx.destination);
        g.gain.value = 0.13;
        o.start();
        setTimeout(() => { o.frequency.value = 1100; }, 70);
        setTimeout(() => { g.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.18); }, 120);
        setTimeout(() => { o.stop(); ctx.close(); }, 250);
        chime = true;
        setTimeout(() => { chime = false; }, 350);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // --- THEME CONTROLS ---
    const darkToggle = document.getElementById('dark-toggle');
    const darkIcon = document.getElementById('dark-icon');
    const themeColor = document.getElementById('theme-color');

    // Menu setup
    const appMenuButton = document.getElementById('app-menu-button');
    const appMenu = document.getElementById('app-menu');

    if (appMenuButton && appMenu) {
        appMenuButton.addEventListener('click', (event) => {
            event.stopPropagation(); // Prevents click from immediately closing menu if menu itself is clicked
            const isHidden = appMenu.style.display === 'none' || appMenu.style.display === '';
            appMenu.style.display = isHidden ? 'block' : 'none';
        });

        // Close menu if clicking outside
        document.addEventListener('click', (event) => {
            if (!appMenu.contains(event.target) && event.target !== appMenuButton) {
                appMenu.style.display = 'none';
            }
        });
    }

    // Sound mute button
    const soundControlsContainer = document.getElementById('app-menu-sound-controls');
    let muteBtn = document.createElement('button');
    muteBtn.id = 'mute-btn';
    muteBtn.title = 'Mute/unmute AI sound';
    // Adjust styles for menu context
    muteBtn.style.background = 'none';
    muteBtn.style.border = 'none';
    muteBtn.style.cursor = 'pointer';
    muteBtn.style.fontSize = '1.2rem'; // Slightly smaller for menu
    muteBtn.style.padding = '5px';
    muteBtn.innerHTML = soundMuted ? '🔇 Mute Sound' : '🔔 Unmute Sound'; // Add text for clarity

    if (soundControlsContainer) {
        soundControlsContainer.appendChild(muteBtn);
    } else {
        // Fallback if the designated container isn't found (should not happen with correct HTML)
        console.warn('Could not find app-menu-sound-controls to append mute button.');
        // document.querySelector('.header-controls').appendChild(muteBtn); // Old behavior as a last resort
    }

    muteBtn.onclick = () => {
        soundMuted = !soundMuted;
        muteBtn.innerHTML = soundMuted ? '🔇 Mute Sound' : '🔔 Unmute Sound';
        localStorage.setItem('synthai_muted', soundMuted ? 'true' : 'false');
    };

    // Dark mode logic
    function setDarkMode(on) {
        if (on) {
            document.body.classList.add('dark');
            darkIcon.textContent = '☀️';
            localStorage.setItem('synthai_dark', 'true');
        } else {
            document.body.classList.remove('dark');
            darkIcon.textContent = '🌙';
            localStorage.setItem('synthai_dark', 'false');
        }
    }
    // Restore user preference
    setDarkMode(localStorage.getItem('synthai_dark') === 'true');
    darkToggle.onclick = () => {
        setDarkMode(!document.body.classList.contains('dark'));
    };

    // Theme color logic
    function setAccent(val) {
        document.documentElement.style.setProperty('--accent', val);
        // Pick a contrasting accent2 (simple: rotate hue 150deg)
        const c2 = chroma(val).set('hsl.h', "+150").hex();
        document.documentElement.style.setProperty('--accent2', c2);
        localStorage.setItem('synthai_accent', val);
    }
    // Try to use chroma.js if available, else fallback
    function ensureChroma(cb) {
        if (window.chroma) return cb();
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/chroma-js/2.4.2/chroma.min.js';
        s.onload = cb;
        document.head.appendChild(s);
    }
    themeColor.addEventListener('input', e => {
        ensureChroma(() => setAccent(e.target.value));
    });
    // Restore accent
    const savedAccent = localStorage.getItem('synthai_accent');
    if (savedAccent) ensureChroma(() => {
        themeColor.value = savedAccent;
        setAccent(savedAccent);
    });
    // End of DOMContentLoaded
});

const collaborativeWriting = document.getElementById('collaborative-writing');
const networkSvg = d3.select('#network-graph');
const cloudSvg = d3.select('#word-cloud');

// --- AI Integration ---
const askAiBtn = document.getElementById('ask-ai-btn');
const aiResponseDiv = document.getElementById('ai-response');
if (askAiBtn && aiResponseDiv && collaborativeWriting) {
    askAiBtn.addEventListener('click', async () => {
        const userText = collaborativeWriting.value.trim();
        if (!userText) {
            aiResponseDiv.textContent = 'Please enter some text.';
            return;
        }
        aiResponseDiv.textContent = 'Thinking...';
        try {
            const response = await fetch('http://localhost:3001/api/ask-ai', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: userText })
            });
            const data = await response.json();
            if (data.ai) {
                aiResponseDiv.textContent = data.ai;
                aiResponseDiv.style.opacity = 0;
                setTimeout(() => {
                    aiResponseDiv.style.transition = 'opacity 0.5s';
                    aiResponseDiv.style.opacity = 1;
                    // Confetti burst
                    confettiBurst(aiResponseDiv);
                    // Play sound
                    if (!soundMuted) playChime();
                }, 100);
            } else {
                aiResponseDiv.textContent = data.error || 'No response from AI.';
            }
        } catch (err) {
            aiResponseDiv.textContent = 'Error connecting to AI service.';
        }
    });
    // Pulse animation for button
    askAiBtn.addEventListener('mouseenter', () => {
        askAiBtn.animate([
            { boxShadow: '0 4px 16px rgba(106,130,251,0.15)' },
            { boxShadow: '0 8px 32px rgba(252,92,125,0.17)' },
            { boxShadow: '0 4px 16px rgba(106,130,251,0.15)' }
        ], { duration: 600, iterations: 1 });
    });
}

// Fade in collaborative writing and cards
window.addEventListener('DOMContentLoaded', () => {
    const fadeEls = [
        document.querySelector('.left-column'),
        document.querySelector('.right-column'),
        document.getElementById('collaborative-writing')
    ];
    fadeEls.forEach(el => {
        if (el) {
            el.style.opacity = 0;
            el.style.transition = 'opacity 1.2s cubic-bezier(.22,1,.36,1)';
            setTimeout(() => { el.style.opacity = 1; }, 200);
        }
    });
});

// Simple confetti burst (SVG)
function confettiBurst(target) {
    const rect = target.getBoundingClientRect();
    const confetti = document.createElement('div');
    confetti.style.position = 'absolute';
    confetti.style.left = rect.left + window.scrollX + rect.width/2 + 'px';
    confetti.style.top = rect.top + window.scrollY + 10 + 'px';
    confetti.style.pointerEvents = 'none';
    confetti.style.zIndex = 9999;
    confetti.style.width = '0';
    confetti.style.height = '0';
    document.body.appendChild(confetti);
    const colors = ['#6a82fb', '#fc5c7d', '#00c6ff', '#ffd86b', '#43e97b', '#f3f8ff'];
    for (let i = 0; i < 24; i++) {
        const particle = document.createElement('div');
        particle.style.position = 'absolute';
        particle.style.width = '10px';
        particle.style.height = '10px';
        particle.style.borderRadius = '50%';
        particle.style.background = colors[Math.floor(Math.random()*colors.length)];
        particle.style.opacity = 0.85;
        particle.style.transform = 'scale(0.8)';
        confetti.appendChild(particle);
        const angle = (Math.PI * 2 * i) / 24;
        const dist = 48 + Math.random()*24;
        const x = Math.cos(angle) * dist;
        const y = Math.sin(angle) * dist;
        setTimeout(() => {
            particle.animate([
                { transform: 'translate(0,0) scale(0.8)', opacity: 0.9 },
                { transform: `translate(${x}px,${y}px) scale(1.1)`, opacity: 0.7 },
                { transform: `translate(${x*1.2}px,${y*1.2}px) scale(0.6)`, opacity: 0 }
            ], { duration: 900 + Math.random()*400, easing: 'cubic-bezier(.22,1,.36,1)' });
        }, 10);
    }
    setTimeout(() => { confetti.remove(); }, 1400);
}

document.getElementById('summaryButton').addEventListener('click', function() {
    summarizeAnnotations();
});

function summarizeAnnotations() {
    const axios = require('axios'); // Make sure to import axios

async function summarizeAnnotations() {
    try {
        const response = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: "gpt-3.5-turbo", // or any other model you want to use
            messages: [
                { role: "user", content: "Please summarize all annotations." }
            ]
        }, {
            headers: {
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        const summary = response.data.choices[0].message.content;
        alert(summary); // Display the summary in an alert
    } catch (error) {
        console.error("Error fetching summary:", error);
        alert("Failed to fetch summary. Please try again.");
    }
}
        let summary = "Here is a summary of the annotations..."; // Replace with actual summary logic
        alert(summary); // Display the summary in an alert
    }

    // Basic auto-save functionality (local storage)
    collaborativeWriting.addEventListener('input', () => {
        localStorage.setItem('collaborativeText', collaborativeWriting.value);
    });

    // Restore previous text if exists
    const savedText = localStorage.getItem('collaborativeText');
    if (savedText) {
        collaborativeWriting.value = savedText;
    }

    // Stop words to remove
    const stopWords = new Set([
        'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
        'from', 'up', 'about', 'into', 'over', 'after', 'is', 'are', 'was', 'were', 'be', 'been',
        'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'shall', 'should',
        'can', 'could', 'may', 'might', 'must', 'ought', 'i', 'you', 'he', 'she', 'it', 'we', 'they',
        'them', 'their', 'this', 'that', 'these', 'those', 'am', 'is', 'are', 'was', 'were'
    ]);

    // Word cloud generation function
    function generateWordCloud(text) {
        // Tokenize and clean text
        const words = text.toLowerCase()
            .replace(/[^\w\s]/g, '')  // Remove punctuation
            .split(/\s+/)  // Split into words
            .filter(word => word.length > 2)  // Filter out very short words
            .filter(word => !stopWords.has(word));  // Remove stop words

        // Count word frequencies
        const wordFreq = {};
        words.forEach(word => {
            wordFreq[word] = (wordFreq[word] || 0) + 1;
        });

        // Convert to word cloud data format
        const wordCloudData = Object.entries(wordFreq)
            .map(([text, size]) => ({ text, size }))
            .sort((a, b) => b.size - a.size)
            .slice(0, 50);  // Limit to top 50 words

        // Word cloud visualization
        const width = cloudSvg.node().getBoundingClientRect().width;
        const height = cloudSvg.node().getBoundingClientRect().height;

        // Ensure cloud is cleared before rendering
        cloudSvg.selectAll('*').remove();

        // Create cloud layout
        const cloud = d3.layout.cloud()
            .size([width, height])
            .words(wordCloudData)
            .padding(5)
            .rotate(() => ~~(Math.random() * 2) * 90)  // Random 0 or 90 degree rotation
            .fontSize(d => d.size)
            .on('end', draw);

        function draw(words) {
            const cloudGroup = cloudSvg.append('g')
                .attr('transform', `translate(${width/2},${height/2})`);
            
            cloudGroup.selectAll('text')
                .data(words)
                .enter().append('text')
                .style('font-size', d => `${d.size}px`)
                .style('fill', (d, i) => d3.schemeCategory10[i % 10])
                .attr('text-anchor', 'middle')
                .attr('transform', d => `translate(${d.x},${d.y})rotate(${d.rotate})`)
                .text(d => d.text);
        }

        cloud.start();
    }

    // Combine all text for word cloud
    let allText = '';

    // Network graph visualization
    Papa.parse('/synthesisAI_testing_data.csv', {
        download: true,
        header: true,
        complete: function(results) {
            // Aggregate student interactions
            const studentNodes = {};
            const studentLinks = {};

            results.data.forEach(row => {
                const studentId = row['Student ID'];
                const firstName = row['First name'];
                const inResponseTo = row['In response to comment ID'];
                const commentText = row['Comment text'];

                // Accumulate text for word cloud
                allText += ` ${commentText}`;

                // Initialize student node
                if (!studentNodes[studentId]) {
                    studentNodes[studentId] = {
                        id: studentId,
                        name: firstName,
                        commentCount: 1
                    };
                } else {
                    studentNodes[studentId].commentCount++;
                }

                // Track interactions between students
                if (inResponseTo) {
                    // Find the original comment's student ID
                    const originalComment = results.data.find(r => r['Comment ID'] === inResponseTo);
                    if (originalComment) {
                        const originalStudentId = originalComment['Student ID'];
                        
                        // Create or update link
                        const linkKey = `${studentId}-${originalStudentId}`;
                        if (!studentLinks[linkKey]) {
                            studentLinks[linkKey] = {
                                source: studentId,
                                target: originalStudentId,
                                weight: 1
                            };
                        } else {
                            studentLinks[linkKey].weight++;
                        }
                    }
                }
            });

            // Generate word cloud after processing all data
            generateWordCloud(allText);

            // Convert to arrays
            const nodes = Object.values(studentNodes);
            const links = Object.values(studentLinks);

            // Set up SVG dimensions (responsive)
let width = networkSvg.node().getBoundingClientRect().width;
let height = networkSvg.node().getBoundingClientRect().height;
networkSvg.attr('width', '100%').attr('height', '100%').attr('viewBox', `0 0 ${width} ${height}`);


            // Create color scale
            const colorScale = d3.scaleOrdinal(d3.schemeCategory10);

            // Create force simulation
            const simulation = d3.forceSimulation(nodes)
                .force('charge', d3.forceManyBody().strength(-200)) // Increased repulsion
                .force('link', d3.forceLink(links)
                    .id(d => d.id)
                    .distance(d => Math.max(50, 100 / d.weight)) // Adjusted link distance
                )
                .force('center', d3.forceCenter(width / 2, height / 2))
                .force('x', d3.forceX(width / 2).strength(0.1)) // Additional X positioning
                .force('y', d3.forceY(height / 2).strength(0.1)); // Additional Y positioning

            // Create link elements (arrows for directed graph)
            const link = networkSvg.append('g')
                .selectAll('line')
                .data(links)
                .enter()
                .append('line')
                .attr('stroke', '#999')
                .attr('stroke-opacity', d => Math.min(0.8, d.weight / 3))
                .attr('stroke-width', d => {
                    // More pronounced weight scaling
                    const baseWidth = 1;
                    const scaleFactor = 4;
                    return baseWidth + (Math.log(d.weight + 1) * scaleFactor);
                });

            // Create arrowhead markers
            networkSvg.append('defs')
                .selectAll('marker')
                .data(['end'])
                .enter()
                .append('marker')
                .attr('id', 'arrowhead')
                .attr('viewBox', '-0 -5 10 10')
                .attr('refX', 15)
                .attr('refY', 0)
                .attr('orient', 'auto')
                .attr('markerWidth', 6)
                .attr('markerHeight', 6)
                .attr('xoverflow', 'visible')
                .append('svg:path')
                .attr('d', 'M 0,-5 L 10 ,0 L 0,5')
                .attr('fill', '#999')
                .style('stroke', 'none');

            // Add arrowheads to links
            link.attr('marker-end', 'url(#arrowhead)');

            // Create node elements
            const node = networkSvg.append('g')
                .selectAll('g')
                .data(nodes)
                .enter()
                .append('g')
                .call(d3.drag()
                    .on('start', dragstarted)
                    .on('drag', dragged)
                    .on('end', dragended)
                );

            // Drag functions
            function dragstarted(event, d) {
                if (!event.active) simulation.alphaTarget(0.3).restart();
                d.fx = d.x;
                d.fy = d.y;
            }
            function dragged(event, d) {
                d.fx = event.x;
                d.fy = event.y;
            }
            function dragended(event, d) {
                if (!event.active) simulation.alphaTarget(0);
                d.fx = null;
                d.fy = null;
            }


            // Add circles
            node.append('circle')
                .attr('r', d => Math.max(5, Math.log(d.commentCount) * 3))
                .attr('fill', d => colorScale(d.name[0]))
                .on('mouseover', function(event, d) {
                    d3.select(this).attr('stroke', '#fc5c7d').attr('stroke-width', 3);
                    node.selectAll('text').filter(t => t === d).attr('font-weight', 'bold');
                })
                .on('mouseout', function(event, d) {
                    d3.select(this).attr('stroke', null).attr('stroke-width', null);
                    node.selectAll('text').filter(t => t === d).attr('font-weight', null);
                });

            // Add text labels
            node.append('text')
                .attr('text-anchor', 'middle')
                .attr('dy', '.3em')
                .attr('font-size', '8px')
                .text(d => d.name)
                .attr('fill', 'white');

            // Add tooltips
            node.append('title')
                .text(d => `${d.name} (ID: ${d.id})
Comments: ${d.commentCount}`);

            // Zoom and pan behavior
            networkSvg.call(d3.zoom()
                .scaleExtent([0.2, 3])
                .on('zoom', (event) => {
                    networkSvg.selectAll('g').attr('transform', event.transform);
                })
            );

            // Update positions on each tick
            simulation.on('tick', () => {
                link
                    .attr('x1', d => d.source.x)
                    .attr('y1', d => d.source.y)
                    .attr('x2', d => d.target.x)
                    .attr('y2', d => d.target.y);

                node
                    .attr('transform', d => `translate(${d.x},${d.y})`);
            });

            // Responsive resize
            window.addEventListener('resize', () => {
                width = networkSvg.node().getBoundingClientRect().width;
                height = networkSvg.node().getBoundingClientRect().height;
                networkSvg.attr('viewBox', `0 0 ${width} ${height}`);
                simulation.force('center', d3.forceCenter(width / 2, height / 2));
                simulation.force('x', d3.forceX(width / 2).strength(0.1));
                simulation.force('y', d3.forceY(height / 2).strength(0.1));
                simulation.alpha(0.7).restart();
            });
        }
    });
