document.addEventListener('DOMContentLoaded', () => {
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
                } else {
                    aiResponseDiv.textContent = data.error || 'No response from AI.';
                }
            } catch (err) {
                aiResponseDiv.textContent = 'Error connecting to AI service.';
            }
        });
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
            .fontSize(d => Math.sqrt(d.size) * 10)
            .on('end', draw);

        function draw(words) {
            const cloudGroup = cloudSvg.append('g')
                .attr('transform', `translate(${width/2},${height/2})`);
            
            cloudGroup.selectAll('text')
                .data(words)
                .enter().append('text')
                .style('font-size', d => `${Math.sqrt(d.size) * 10}px`)
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

            // Set up SVG dimensions
            const width = networkSvg.node().getBoundingClientRect().width;
            const height = networkSvg.node().getBoundingClientRect().height;

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
                .append('g');

            // Add circles
            node.append('circle')
                .attr('r', d => Math.max(5, Math.log(d.commentCount) * 3))
                .attr('fill', d => colorScale(d.name[0]));

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
        }
    });
});
