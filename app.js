// Stop words to remove
const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
    'from', 'up', 'about', 'into', 'over', 'after', 'is', 'are', 'was', 'were', 'be', 'been',
    'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'shall', 'should',
    'can', 'could', 'may', 'might', 'must', 'ought', 'i', 'you', 'he', 'she', 'it', 'we', 'they',
    'them', 'their', 'this', 'that', 'these', 'those', 'am', 'is', 'are', 'was', 'were'
]);

// Sound mute button
let soundMuted = localStorage.getItem('synthai_muted') === 'true';
let chime;

const networkSvg = d3.select('#network-graph');
const cloudSvg = d3.select('#word-cloud');
const collaborativeWriting = document.getElementById('collaborative-writing');

// --- CLICKSTREAM TRACKING GLOBALS ---
let clickstreamBuffer = [];
const CLICKSTREAM_BUFFER_MAX_SIZE = 5; // Send data when buffer reaches this size (WAS 50)
const CLICKSTREAM_SEND_INTERVAL_MS = 5000; // Send data every 5 seconds (WAS 30000)
let clickstreamIntervalId = null;

/**
 * Gets a CSS-like selector for an HTML element for clickstream logging.
 * @param {Element} el The HTML element.
 * @returns {string} A string representing the element.
 */
function getElementSelector(el) {
    if (!el || !el.tagName) return '';
    let selector = el.tagName.toLowerCase();
    if (el.id) {
        selector += `#${el.id}`;
    }
    const classNames = el.className && typeof el.className === 'string' ? el.className.trim().split(/\s+/).filter(c => c).join('.') : '';
    if (classNames) {
        selector += `.${classNames}`;
    }
    
    // For input elements, add type and name if available
    if (el.tagName.toLowerCase() === 'input' && el.type) {
        selector += `[type="${el.type}"]`;
        if (el.name) {
            selector += `[name="${el.name}"]`;
        }
    }
    return selector;
}

/**
 * Sends the buffered clickstream data to the server.
 */
async function sendClickstreamData() {
    console.log('sendClickstreamData CALLED. Buffer size:', clickstreamBuffer.length); // <-- DEBUG LINE
    if (clickstreamBuffer.length === 0) {
        return;
    }

    const dataToSend = [...clickstreamBuffer]; // Copy buffer
    clickstreamBuffer = []; // Clear buffer immediately

    console.log('Sending clickstream data:', dataToSend.length, "events");
    try {
        const response = await fetch('http://localhost:3001/api/log-clickstream', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(dataToSend),
        });

        if (response.ok) {
            const result = await response.json(); // Assuming server sends JSON response
            console.log('Clickstream data sent successfully:', result);
        } else {
            const errorResult = await response.text();
            console.error('Failed to send clickstream data:', response.status, errorResult);
            // Optional: Add dataToSend back to the buffer if sending fails and it's critical
            // clickstreamBuffer.unshift(...dataToSend); 
        }
    } catch (error) {
        console.error('Error during sendClickstreamData fetch:', error);
        // Optional: Add dataToSend back to the buffer here as well
        // clickstreamBuffer.unshift(...dataToSend);
    }
}

/**
 * Logs a click event to the clickstream buffer.
 * @param {MouseEvent} event The click event.
 */
function logClickEvent(event) {
    if (event.target.id === 'ask-ai-btn' || event.target.closest('#ask-ai-btn')) {
        // Could add specific handling or ignore if needed, for now, log all
    }
    clickstreamBuffer.push({
        type: 'click',
        timestamp: new Date().toISOString(),
        target: getElementSelector(event.target),
        x: event.clientX,
        y: event.clientY,
        button: event.button,
        ctrlKey: event.ctrlKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
        metaKey: event.metaKey
    });
    console.log('Event logged (click). Buffer size:', clickstreamBuffer.length); // <-- DEBUG LINE

    if (clickstreamBuffer.length >= CLICKSTREAM_BUFFER_MAX_SIZE) {
        console.log('Buffer max size reached from click, calling sendClickstreamData.'); // <-- DEBUG LINE
        sendClickstreamData();
    }
}

/**
 * Logs a keydown event to the clickstream buffer.
 * @param {KeyboardEvent} event The keydown event.
 */
function logKeyEvent(event) {
    const targetElement = event.target;
    const isInputOrTextarea = targetElement.tagName === 'INPUT' || targetElement.tagName === 'TEXTAREA';

    // More selective logging for keystrokes to avoid excessive data
    // Log all keys if not in an input/textarea, or specific keys (Enter, Tab) in input/textarea
    // You can adjust this logic based on what's most valuable.
    if (!isInputOrTextarea || (isInputOrTextarea && (event.key === 'Enter' || event.key === 'Tab'))) {
        let keyData = {
            type: 'keydown',
            timestamp: new Date().toISOString(),
            target: getElementSelector(targetElement),
            key: event.key,
            code: event.code,
            ctrlKey: event.ctrlKey,
            shiftKey: event.shiftKey,
            altKey: event.altKey,
            metaKey: event.metaKey
        };

        if (isInputOrTextarea && (event.key === 'Enter' || event.key === 'Tab')) {
            keyData.valueSnapshot = targetElement.value; // Capture value on Enter/Tab
        }
        clickstreamBuffer.push(keyData);
        console.log('Key event logged. Buffer size:', clickstreamBuffer.length); // <-- DEBUG LINE

        if (clickstreamBuffer.length >= CLICKSTREAM_BUFFER_MAX_SIZE) {
            console.log('Buffer max size reached from key event, calling sendClickstreamData.'); // <-- DEBUG LINE
            sendClickstreamData();
        }
    }
}
// --- END CLICKSTREAM TRACKING GLOBALS AND FUNCTIONS ---

// --- ADMIN LOGS MODAL ELEMENTS & FUNCTIONS ---
let adminLogsModal = null;
let adminLogsBtn = null;
let closeAdminModalBtn = null;
let clickstreamLogDataEl = null;
let visualizationLogDataEl = null;

async function fetchAndDisplayAdminLogs() {
    if (!clickstreamLogDataEl || !visualizationLogDataEl) {
        console.error('Log display elements not found in modal.');
        return;
    }
    console.log('Fetching admin logs...');
    clickstreamLogDataEl.textContent = 'Loading clickstream logs...';
    visualizationLogDataEl.textContent = 'Loading visualization logs...';

    try {
        // Fetch clickstream logs
        const clickstreamRes = await fetch('http://localhost:3001/api/get-clickstream-logs');
        if (!clickstreamRes.ok) {
            throw new Error(`Clickstream logs fetch failed: ${clickstreamRes.status}`);
        }
        const clickstreamLogStrings = await clickstreamRes.json(); // Array of JSON strings
        
        // Parse each JSON string and then re-stringify the whole collection for display
        const parsedClickstreamLogs = clickstreamLogStrings.map((logString, index) => {
            try {
                return JSON.parse(logString);
            } catch (e) {
                console.error(`Error parsing clickstream log string at index ${index}:`, logString);
                console.error('Parse error:', e);
                // Return an error object or null for this entry
                return { error: 'Failed to parse log entry', originalString: logString, details: e.message };
            }
        });
        clickstreamLogDataEl.textContent = JSON.stringify(parsedClickstreamLogs, null, 2);
        if (parsedClickstreamLogs.length === 0) {
            clickstreamLogDataEl.textContent = 'No clickstream events logged yet.';
        }

        // Fetch visualization logs
        const vizLogRes = await fetch('http://localhost:3001/api/get-visualization-logs');
        if (!vizLogRes.ok) {
            throw new Error(`Visualization logs fetch failed: ${vizLogRes.status}`);
        }
        const vizLogData = await vizLogRes.json();
        visualizationLogDataEl.textContent = JSON.stringify(vizLogData, null, 2);
        if (Object.keys(vizLogData).length === 0 && vizLogData.constructor === Object) {
            visualizationLogDataEl.textContent = 'No visualization data saved yet.';
        }

    } catch (error) {
        console.error('Error fetching admin logs:', error);
        clickstreamLogDataEl.textContent = `Error loading clickstream logs: ${error.message}`;
        visualizationLogDataEl.textContent = `Error loading visualization logs: ${error.message}`;
    }
}

function openAdminModal() {
    if (adminLogsModal) {
        fetchAndDisplayAdminLogs(); // Fetch logs when modal is opened
        adminLogsModal.style.display = 'block';
    }
}

function closeAdminModal() {
    if (adminLogsModal) {
        adminLogsModal.style.display = 'none';
    }
}
// --- END ADMIN LOGS MODAL --- 

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

// --- DATA PROCESSING AND VISUALIZATION FUNCTIONS ---
/**
 * Processes raw CSV data to prepare it for network and word cloud visualizations.
 * @param {Array<Object>} rawData - Array of row objects from CSV parsing.
 * @returns {Object|null} An object { network: { nodes, links }, wordCloudText } or null if data is invalid.
 */
function processDataForVisualizations(rawData) {
    if (!rawData || rawData.length === 0) {
        console.error("processDataForVisualizations: No raw data provided or data is empty.");
        return null;
    }

    const studentNodesMap = {};
    const studentLinksMap = {};
    let allCommentTextForCloud = '';

    rawData.forEach(row => {
        const studentId = row['Student ID'];
        const firstName = row['First name'];
        const inResponseTo = row['In response to comment ID'];
        const commentText = row['Comment text'];

        if (commentText) {
            allCommentTextForCloud += ` ${commentText}`;
        }

        if (!studentId || !firstName) { // Basic validation
            // console.warn("Skipping row due to missing Student ID or First Name:", row);
            return; // Skip incomplete rows for network processing
        }

        // Initialize student node
        if (!studentNodesMap[studentId]) {
            studentNodesMap[studentId] = {
                id: studentId,
                name: firstName,
                commentCount: 0
            };
        }
        studentNodesMap[studentId].commentCount++;

        // Track interactions between students
        if (inResponseTo) {
            // Find the author of the comment being responded to
            const targetStudentRow = rawData.find(r => r['Comment ID'] === inResponseTo);
            if (targetStudentRow) {
                const targetStudentId = targetStudentRow['Student ID'];
                if (targetStudentId && targetStudentId !== studentId) {
                    const linkKey = [studentId, targetStudentId].sort().join('-');
                    studentLinksMap[linkKey] = (studentLinksMap[linkKey] || 0) + 1;
                }
            }
        }
    });

    const nodes = Object.values(studentNodesMap);
    const links = Object.entries(studentLinksMap).map(([key, value]) => {
        const [source, target] = key.split('-');
        return { source, target, value };
    });

    // Ensure all linked nodes exist in the nodes array, add if missing (though less likely with current logic)
    links.forEach(link => {
        if (!studentNodesMap[link.source]) {
             // This case implies a link to a student who made no comments of their own
             // For simplicity, we'll ensure they exist. A more robust system might fetch their name.
            if (nodes.filter(n => n.id === link.source).length === 0) {
                nodes.push({ id: link.source, name: `Student ${link.source}`, commentCount: 0 });
            }
        }
        if (!studentNodesMap[link.target]) {
            if (nodes.filter(n => n.id === link.target).length === 0) {
                 nodes.push({ id: link.target, name: `Student ${link.target}`, commentCount: 0 });
            }
        }
    });
    
    // Filter out nodes with no comments if they also have no links (truly isolated)
    const linkedNodeIds = new Set();
    links.forEach(link => {
        linkedNodeIds.add(link.source);
        linkedNodeIds.add(link.target);
    });
    const finalNodes = nodes.filter(node => node.commentCount > 0 || linkedNodeIds.has(node.id));

    return { 
        network: { nodes: finalNodes, links }, 
        wordCloudText: allCommentTextForCloud.trim()
    };
}

/**
 * Draws the network graph using D3.js.
 * @param {Array<Object>} nodes - Array of node objects for the graph.
 * @param {Array<Object>} links - Array of link objects for the graph.
 */
function drawNetworkGraph(nodes, links) {
    if (!nodes || !links) {
        console.error("drawNetworkGraph: Nodes or links data is missing.");
        return;
    }
    networkSvg.selectAll("*").remove(); // Clear previous graph

    const width = networkSvg.node().getBoundingClientRect().width;
    const height = networkSvg.node().getBoundingClientRect().height;

    const simulation = d3.forceSimulation(nodes)
        .force("link", d3.forceLink(links).id(d => d.id).distance(100).strength(0.5))
        .force("charge", d3.forceManyBody().strength(-150))
        .force("center", d3.forceCenter(width / 2, height / 2))
        .force("collision", d3.forceCollide().radius(d => d.commentCount * 2 + 10)); // Collision based on comment count

    const link = networkSvg.append("g")
        .attr("class", "links")
        .selectAll("line")
        .data(links)
        .enter().append("line")
        .attr("stroke-width", d => Math.sqrt(d.value * 2))
        .attr("stroke", "#999")
        .attr("stroke-opacity", 0.6);

    const node = networkSvg.append("g")
        .attr("class", "nodes")
        .selectAll("g")
        .data(nodes)
        .enter().append("g");

    node.append("circle")
        .attr("r", d => d.commentCount * 2 + 8) // Size based on comment count
        .attr("fill", (d, i) => d3.schemeCategory10[i % 10])
        .call(d3.drag()
            .on("start", dragstarted)
            .on("drag", dragged)
            .on("end", dragended));

    node.append("text")
        .text(d => d.name)
        .attr("x", 10)
        .attr("y", 4)
        .style("font-size", "12px")
        .style("fill", "#333");

    node.append("title")
        .text(d => `${d.name} (${d.commentCount} comments)`);

    simulation.on("tick", () => {
        link
            .attr("x1", d => d.source.x)
            .attr("y1", d => d.source.y)
            .attr("x2", d => d.target.x)
            .attr("y2", d => d.target.y);
        node
            .attr("transform", d => `translate(${d.x},${d.y})`);
    });

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
}

// Word cloud generation function (mostly unchanged, already clears SVG)
function generateWordCloud(text) {
    if (typeof text !== 'string' || !text.trim()) {
        console.warn("generateWordCloud: No text provided or text is empty.");
        cloudSvg.selectAll("*").remove(); // Clear if no text
        return;
    }
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

// --- DATA SAVING FUNCTION ---
/**
 * Saves the processed visualization data to the ai-proxy server.
 * @param {Object} vizDataPayload - The data to save { network: { nodes, links }, wordCloudText }.
 */
async function saveVisualizationData(vizDataPayload) {
    if (!vizDataPayload) {
        console.error("saveVisualizationData: No data payload provided.");
        return;
    }
    console.log("Attempting to save visualization data:", vizDataPayload);
    try {
        const response = await fetch('http://localhost:3001/api/save-visualization-data', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(vizDataPayload),
        });

        if (response.ok) {
            const result = await response.json();
            console.log('Visualization data saved successfully:', result);
            // Optionally, provide user feedback e.g., a small, temporary notification
        } else {
            const errorResult = await response.text();
            console.error('Failed to save visualization data:', response.status, errorResult);
            alert(`Error saving visualization data: ${response.status}. Check console for details.`);
        }
    } catch (error) {
        console.error('Error during saveVisualizationData fetch:', error);
        alert('Network error or server unavailable while trying to save visualization data. Check console.');
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

    // Explicit check before appendChild for debugging Cypress
    if (!soundControlsContainer) {
        throw new Error("FATAL: soundControlsContainer is null right before appendChild. ID 'app-menu-sound-controls' not found.");
    }

    if (soundControlsContainer && muteBtn) { // Ensure muteBtn is defined before use
        soundControlsContainer.appendChild(muteBtn);
    } else {
        // This else block might not be reached if the throw above happens, but kept for logical completeness
        console.warn('Could not find app-menu-sound-controls or muteBtn is not defined. This warning is after the explicit throw.');
    }

    if(muteBtn) { // Ensure muteBtn exists before attaching onclick
        muteBtn.onclick = () => {
            soundMuted = !soundMuted;
            muteBtn.innerHTML = soundMuted ? '🔇 Mute Sound' : '🔔 Unmute Sound';
            localStorage.setItem('synthai_muted', soundMuted ? 'true' : 'false');
        };
    }

    // --- CSV Upload for Annotations ---
    const loadAnnotationsBtn = document.getElementById('add-annotations-btn');
    const csvUploadInput = document.getElementById('csv-upload-input');

    if (loadAnnotationsBtn && csvUploadInput && appMenu) { // Check for appMenu to close it
        loadAnnotationsBtn.addEventListener('click', () => {
            csvUploadInput.click(); // Trigger click on hidden file input
            appMenu.style.display = 'none'; // Close the menu
        });

        csvUploadInput.addEventListener('change', (event) => {
            const file = event.target.files[0];
            if (file) {
                console.log('Selected file for annotations:', file.name);
                Papa.parse(file, {
                    header: true,        // Assumes the first row of CSV is the header row
                    dynamicTyping: true, // Automatically converts numeric and boolean data
                    skipEmptyLines: true,
                    complete: function(results) {
                        console.log('Parsed CSV data for annotations:', results.data);
                        // TODO: Process results.data to update network and wordcloud visualizations
                        // Placeholder for now: alert that data is parsed
                        if (results.data && results.data.length > 0) {
                            const vizData = processDataForVisualizations(results.data);
                            if (vizData) {
                                drawNetworkGraph(vizData.network.nodes, vizData.network.links);
                                generateWordCloud(vizData.wordCloudText);
                                alert(`Successfully updated visualizations with ${results.data.length} rows from ${file.name}.`);
                                saveVisualizationData(vizData); // Save uploaded data
                            } else {
                                console.error("Uploaded CSV: Failed to process data for visualizations.", results.errors);
                                alert('Error processing CSV data for visualizations. Check console.');
                            }
                        } else {
                            alert('No data found in the uploaded CSV to visualize.');
                        }
                        if(results.errors.length > 0){
                            console.warn("Parsing errors in uploaded CSV:", results.errors);
                            // Optionally alert user about specific parsing errors if needed
                        }
                    },
                    error: function(error, file) {
                        console.error('Error parsing uploaded CSV:', file, error);
                        alert('Error parsing CSV file. Please check the console and file format.');
                    }
                });
                // Reset the input value to allow re-selecting the same file if needed
                event.target.value = null;
            }
        });
    }
    // --- End CSV Upload for Annotations ---

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

    // --- AI Integration ---
    const aiQueryInput = document.getElementById('ai-query-input');
    const askAiButton = document.getElementById('ask-ai-btn');
    const aiChatWindow = document.getElementById('ai-chat-window');

    if (askAiButton && aiChatWindow && collaborativeWriting) { // collaborativeWriting is global
        askAiButton.addEventListener('click', async () => {
            const query = aiQueryInput.value.trim();
            if (!query) {
                appendChatMessage('Please type a question for the AI.', 'ai'); // AI gives a system-like message
                return;
            }
            
            appendChatMessage(query, 'user');
            aiQueryInput.value = ''; // Clear the input field
            
            const thinkingMessage = appendChatMessage('AI is thinking...', 'ai'); // Store reference if we want to remove it later

            try {
                const response = await fetch('http://localhost:3001/api/ask-ai', {
                    method: 'POST',
                    body: JSON.stringify({ text: query }), // Send the query from aiQueryInput
                    headers: { 'Content-Type': 'application/json' }
                });
                const data = await response.json();

                // Optional: Remove thinking message if you have a reference to it
                // if (thinkingMessage && thinkingMessage.parentNode) {
                //    thinkingMessage.parentNode.removeChild(thinkingMessage);
                // }

                if (data.ai) {
                    appendChatMessage(data.ai, 'ai');
                    if (!soundMuted) playChime(); // playChime is global
                } else {
                    appendChatMessage(data.error || 'No response from AI.', 'ai');
                }
            } catch (err) {
                // Optional: Remove thinking message if an error occurs too
                // if (thinkingMessage && thinkingMessage.parentNode) {
                //    thinkingMessage.parentNode.removeChild(thinkingMessage);
                // }
                console.error('AI Query Error:', err); // Log the actual error
                appendChatMessage('Error connecting to AI service. Please check console for details.', 'ai');
            }
        });

        askAiButton.addEventListener('mouseenter', () => {
            askAiButton.animate([
                { boxShadow: '0 4px 16px rgba(106,130,251,0.15)' },
                { boxShadow: '0 8px 32px rgba(252,92,125,0.17)' },
                { boxShadow: '0 4px 16px rgba(106,130,251,0.15)' }
            ], { duration: 600, iterations: 1 });
        });
    }
    // --- End AI Integration ---

    // --- Summary Button ---
    const summaryButton = document.getElementById('summaryButton');
    if (summaryButton) {
        summaryButton.addEventListener('click', async () => {
            await summarizeAnnotations(); // summarizeAnnotations is global
        });
    }
    // --- End Summary Button ---

    // --- Auto-save for collaborativeWriting ---
    if (collaborativeWriting) { // collaborativeWriting is global
        const savedText = localStorage.getItem('collaborativeWritingText');
        if (savedText) {
            collaborativeWriting.value = savedText;
        }
        collaborativeWriting.addEventListener('input', () => {
            localStorage.setItem('collaborativeWritingText', collaborativeWriting.value);
        });
    }
    // --- End Auto-save ---

    // --- Fade in collaborative writing and cards ---
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

    // --- ADMIN LOGS MODAL SETUP ---
    adminLogsModal = document.getElementById('adminLogsModal');
    adminLogsBtn = document.getElementById('adminLogsBtn');
    closeAdminModalBtn = document.getElementById('closeAdminModalBtn');
    clickstreamLogDataEl = document.getElementById('clickstreamLogData');
    visualizationLogDataEl = document.getElementById('visualizationLogData');

    if (adminLogsBtn) {
        adminLogsBtn.addEventListener('click', openAdminModal);
    }
    if (closeAdminModalBtn) {
        closeAdminModalBtn.addEventListener('click', closeAdminModal);
    }
    // Close modal if user clicks outside of the modal content
    window.addEventListener('click', (event) => {
        if (event.target === adminLogsModal) {
            closeAdminModal();
        }
    });
    // --- END ADMIN LOGS MODAL SETUP ---

    // --- CLICKSTREAM EVENT LISTENERS AND INTERVAL ---
    document.addEventListener('click', logClickEvent, true); // Use capture phase
    document.addEventListener('keydown', logKeyEvent, true); // Use capture phase

    // Periodically send clickstream data
    clickstreamIntervalId = setInterval(sendClickstreamData, CLICKSTREAM_SEND_INTERVAL_MS);

    // Send any remaining data on page unload
    window.addEventListener('beforeunload', () => {
        // Clear interval to prevent it from running again if page isn't fully unloaded
        if (clickstreamIntervalId) {
            clearInterval(clickstreamIntervalId);
            clickstreamIntervalId = null;
        }
        
        // Use navigator.sendBeacon for more reliable sending during unload
        if (clickstreamBuffer.length > 0) {
            const dataToSend = [...clickstreamBuffer];
            clickstreamBuffer = []; // Clear buffer
            
            const blob = new Blob([JSON.stringify(dataToSend)], { type: 'application/json' });
            navigator.sendBeacon('http://localhost:3001/api/log-clickstream', blob);
            console.log('Attempted to send remaining clickstream data via sendBeacon.');
        }
    });
    // --- END CLICKSTREAM SETUP ---

    // --- INITIAL DATA LOAD ---
    Papa.parse('/synthesisAI_testing_data.csv', {
        download: true,
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
        complete: function(results) {
            console.log('Initial parsed CSV data:', results.data);
            if (results.data && results.data.length > 0) {
                const vizData = processDataForVisualizations(results.data); // Use global helper
                if (vizData) {
                    drawNetworkGraph(vizData.network.nodes, vizData.network.links); // Use global helper
                    generateWordCloud(vizData.wordCloudText); // Use global helper
                    console.log("Initial visualizations rendered successfully.");
                    saveVisualizationData(vizData); // Save initial data
                } else {
                    console.error("Initial Load: Failed to process data for visualizations.", results.errors);
                    alert('Error processing initial CSV data for visualizations. Check console.');
                }
            } else {
                console.warn('No data found in the initial CSV to visualize.');
            }
            if (results.errors.length > 0) {
                console.warn("Parsing errors in initial CSV:", results.errors);
            }
        },
        error: function(error) {
            console.error('Error parsing initial CSV:', error);
            alert('Error parsing initial CSV data. Visualizations may not load.');
        }
    });
    // --- END INITIAL DATA LOAD ---

    // Function to append a message to the AI chat window
    function appendChatMessage(text, sender) {
        if (!aiChatWindow) return null; // Guard clause and return null if not present

        const messageDiv = document.createElement('div');
        messageDiv.classList.add('chat-message');
        messageDiv.classList.add(sender === 'user' ? 'user-message' : 'ai-message');
        
        messageDiv.textContent = text;

        aiChatWindow.appendChild(messageDiv);
        aiChatWindow.scrollTop = aiChatWindow.scrollHeight; // Auto-scroll to the latest message
        return messageDiv; // Return the created message element
    }
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

// summarizeAnnotations - Global async function
async function summarizeAnnotations() {
    // Ensure collaborativeWriting is accessible, it's global now.
    // const currentText = collaborativeWriting.value; // Example usage
    // console.log("Text to summarize: ", currentText);

    // Check if axios is available, if it's meant for frontend, it should be imported via <script> or ESM import
    if (typeof axios === 'undefined') {
        console.error('Axios is not loaded. Cannot fetch summary.');
        alert('Error: Summarization service dependency (axios) is not available.');
        return;
    }
    // Ensure API key is handled securely, not exposed directly in client-side JS for production.
    // For this environment, we assume it's set elsewhere or this is a dev setup.
    const apiKey = process.env.OPENAI_API_KEY; 
    if (!apiKey) {
        console.error('OpenAI API key is not configured.');
        alert('Error: Summarization service is not configured (API key missing).');
        return;
    }

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
