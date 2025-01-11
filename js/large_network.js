import globalState from './globalState.js';
 export function drawLargeNetwork(data, container) {
    const containerWidth = document.querySelector(container).offsetWidth;
    const width = (containerWidth-25);
    const height = 800;
    const initialScale = 0.2; // start zoomed out

    //------------------------------------------------
    // 1) CREATE SVG + ZOOM SLIDER
    //------------------------------------------------

    const sliderContainer = d3.select(container)
        .append('div')
        .style('margin', '10px')
        .style('text-align', 'center') 
        .style('position', 'absolute'); // I want to position it inside the graph container
        
        

    sliderContainer.append('label')
        .attr('for', 'zoom-slider')
        .text('Zoom: ');

    const zoomSlider = sliderContainer.append('input')
        .attr('id', 'zoom-slider')
        .attr('type', 'range')
        .attr('min', 0.1)
        .attr('max', 1.5)
        .attr('step', 0.03)
        .attr('value', initialScale)
        .style('width', '300px');

    const svg = d3.select(container)
        .append('svg')
        .attr('width', width)
        .attr('height', height)
        .style('border', '2px solid #ccc')
        .style('background-color', '#f3ebea');

    const g = svg.append('g');

   
    // Zoom behavior
    const baseFontSize = 12; // Default font size at zoom scale = 1

function zoomed(event) {
    g.attr('transform', event.transform);
    zoomSlider.property('value', event.transform.k);

    // Update the font size of labels dynamically
    g.selectAll('text')
        .style('font-size', `${baseFontSize * 1/event.transform.k}px`);
    }


    const zoom = d3.zoom()
        .scaleExtent([0.1, 4])
        .on('zoom', zoomed);

    svg.call(zoom);
    svg.call(zoom.scaleTo, initialScale);

    zoomSlider.on('input', function () {
        const zoomLevel = parseFloat(this.value);
        svg.transition()
            .duration(200)
            .call(zoom.scaleTo, zoomLevel);
    });

    const linkGroup = g.append('g').attr('class', 'links');
    const nodeGroup = g.append('g').attr('class', 'nodes');
    const labelGroup = g.append('g').attr('class', 'labels');

    let link = linkGroup.selectAll('line');
    let node = nodeGroup.selectAll('circle');
    let label = labelGroup.selectAll('text');


    //------------------------------------------------
    // 2) COLOR SCALES + HELPERS
    //------------------------------------------------

    const myWarmVariedColors = [
        "#6FAB78", // Metaphysics
        "#D96666", // History of Philosophy
        "#A982B4", // Phil of Knowledge
        "#E3A617", // Moral Phil
        "#5C99CC"  // Logic
    ];
    
    
    
    
    const colorScaleDepth1 = d3.scaleOrdinal(myWarmVariedColors);

    // Helper to determine top-level category
    function getTopCategoryName(node) {
        if (!node) return 'Unknown';
        // If node.broaderCategory === 'Root', then node.category is top-level
        if (node.broaderCategory === 'Root') {
            return node.category;
        }
        return node.broaderCategory || node.category || 'Unknown';
    }
    
    function fitView() {
    // Get bounding box of everything in <g>
    const bounds = g.node().getBBox();
    const fullWidth  = width;  
    const fullHeight = height; 


    const widthScale  = fullWidth  / bounds.width;
    const heightScale = fullHeight / bounds.height;
    const zoomLevel   = 0.9 * Math.min(widthScale, heightScale); // a factor < 1 for padding

    // Compute center of bounding box
    const midX = bounds.x + bounds.width/2;
    const midY = bounds.y + bounds.height/2;

    // Define a transform
    const transform = d3.zoomIdentity
        .translate(fullWidth/2, fullHeight/2)
        .scale(zoomLevel)
        .translate(-midX, -midY);

    //  animate
    svg.transition()
        .duration(750)
        .call(zoom.transform, transform);
}

function incrementZoom(delta = 0.1) {
    // look at current slider value
    const currentValue = parseFloat(zoomSlider.property('value'));
    
    
    let newValue = currentValue + delta;
    //  clamp within [min, max]:
    newValue = Math.max(0.1, Math.min(1.5, newValue)); 
  
    // update slider’s displayed value
    zoomSlider.property('value', newValue);
  
    //animate again
    svg.transition()
       .duration(200)               
       .call(zoom.scaleTo, newValue);
  }
  

    //------------------------------------------------
    // 3) BUILD NODES
    //------------------------------------------------

    const nodes = [];

    // Recursively traverse the hierarchy to build a flat array of nodes
    function traverseHierarchy(node, category, broaderCategory = null) {
        nodes.push({
            id: node.id || node.name,
            name: node.name,
            category: category,
            broaderCategory: broaderCategory,
            linkCount: 0,
            author: node.author || null,
            articleUrl: node.article_url || null,
            wordCount: node.word_count || null
        });
        if (node.children) {
            node.children.forEach(child =>
                traverseHierarchy(child, node.name, category)
            );
        }
    }
    traverseHierarchy(data.hierarchy, 'Root');

    // Create a lookup so we can map from id -> node object
    const nodeById = Object.fromEntries(nodes.map(n => [n.id, n]));

    //------------------------------------------------
    // 4) BUILD LINKS (AS NODE OBJECTS)
    //------------------------------------------------

    const links = data.links.map(l => {
        const sourceNode = nodeById[l.source];
        const targetNode = nodeById[l.target];

        // Increase link count for each end
        
        if (targetNode) targetNode.linkCount++;

        // Return the link using node objects
        return {
            source: sourceNode,
            target: targetNode,
            targetTitle: l.targetTitle
        };
    });

    //------------------------------------------------
    // 5) SET UP FORCE SIMULATION (taken from Mike Bostock)
    //------------------------------------------------

    const scale = 0.5;

    const simulation = d3.forceSimulation(nodes)
        .force('link', d3.forceLink(links).id(d => d.id).distance(50 * scale))
        .force('charge', d3.forceManyBody().strength(-300 * scale))
        .force('center', d3.forceCenter(width / 2, height / 2));

  //------------------------------------------------
// 6) DRAW LINKS, NODES, LABELS
//------------------------------------------------

// Update links
link = link.data(links, d => d.source.id + '-' + d.target.id);
link.exit().remove();
const linkEnter = link.enter().append('line')
    .attr('stroke', d => colorScaleDepth1(getTopCategoryName(d.source)))
    .attr('stroke-opacity', 0.6)
    .attr('stroke-width', 0.5);
link = linkEnter.merge(link);

// Update nodes
node = node.data(nodes, d => d.id);
node.exit().remove();
const nodeEnter = node.enter().append('circle')
    .attr('r', d => Math.max(2, d.linkCount * 0.5 * scale))
    .attr('fill', d => colorScaleDepth1(getTopCategoryName(d)))
    .call(d3.drag()
        .on('start', dragStarted)
        .on('drag', dragged)
        .on('end', dragEnded));
node = nodeEnter.merge(node);

// Identify top nodes for labeling
const topNodes = [...nodes].sort((a, b) => b.linkCount - a.linkCount).slice(0, 10);
const topNodeIds = new Set(topNodes.map(n => n.id));

// Update labels
label = label.data(nodes.filter(n => topNodeIds.has(n.id)), d => d.id);
label.exit().remove();
const labelEnter = label.enter().append('text')
    .attr('text-anchor', 'middle')
    .style('font-weight', 'bold')
    .style('font-size', `${baseFontSize}px`)
    .text(d => d.name);
label = labelEnter.merge(label);


    //------------------------------------------------
    // 7) TOOLTIP
    //------------------------------------------------

    const tooltip = d3.select('body').append('div')
        .attr('class', 'tooltip')
        .style('position', 'absolute')
        .style('background-color', '#fff')
        .style('border', '1px solid #ccc')
        .style('padding', '10px')
        .style('border-radius', '5px')
        .style('box-shadow', '0 4px 8px rgba(0, 0, 0, 0.2)')
        .style('pointer-events', 'none')
        .style('opacity', 0);

    node
        .on('mouseover', function(event, d) {
            tooltip.transition().style('opacity', 1);
            tooltip.html(`
                <strong>${d.name}</strong><br>
                <em>Category:</em> ${d.broaderCategory}<br>
                <em>Sub-Category:</em> ${d.category}<br>
                ${d.author ? `<em>Author:</em> ${d.author}<br>` : ''} 
                ${d.wordCount ? `<em>Number of citations:</em> ${d.linkCount}<br>` : ''}
            `)
            .style('left', `${event.pageX + 10}px`)
            .style('top', `${event.pageY + 10}px`);
        })
        .on('mousemove', function(event) {
            tooltip
                .style('left', `${event.pageX + 10}px`)
                .style('top', `${event.pageY + 10}px`);
        })
        .on('mouseout', function() {
            tooltip.transition().style('opacity', 0);
        })
        // NEW CLICK HANDLER:
        .on('click', function(event, d) {
            // Show only this node + its neighbors
            globalState.update({
                type: 'single',
                category: null,
                subcategory: null,
                node: d
            });
        });

    //------------------------------------------------
    // 8) SIMULATION TICK
    //------------------------------------------------

    simulation.on('tick', () => {
        link
            .attr('x1', d => d.source.x)
            .attr('y1', d => d.source.y)
            .attr('x2', d => d.target.x)
            .attr('y2', d => d.target.y);

        node
            .attr('cx', d => d.x)
            .attr('cy', d => d.y);

        labels
            .attr('x', d => d.x)
            .attr('y', d => d.y - 10);
    });

    // Dragging
    function dragStarted(event, d) {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
    }
    function dragged(event, d) {
        d.fx = event.x;
        d.fy = event.y;
    }
    function dragEnded(event, d) {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
    }

    //------------------------------------------------
    // 9) DROPDOWNS FOR FILTERING (EXISTING)
    //------------------------------------------------

    // Keep references to all nodes/links for future filtering
    const allNodes = nodes;     // node objects
    const allLinks = links;     // link objects (with .source and .target as node objects)

    // Build a map of topCategory -> set of subcategories
    const subcategoriesMap = {};
    for (const n of allNodes) {
        const topCat = getTopCategoryName(n);
        const subCat = n.category;
        if (!subcategoriesMap[topCat]) {
            subcategoriesMap[topCat] = new Set();
        }
        if (subCat && subCat !== 'Root') {
            subcategoriesMap[topCat].add(subCat);
        }
    }
     const categoriesToExclude = ["Root", "Philosophy"]
    // Unique top-level categories (excluding 'Unknown')
    const categories = Array.from(
        new Set(allNodes.map(d => getTopCategoryName(d)))
    ).filter(c => c !== 'Unknown'&& !categoriesToExclude.includes(c));

    const categorySelect = d3.select('#category-select');
    const subcategorySelect = d3.select('#subcategory-select');

    categories.forEach(cat => {
        categorySelect.append('option')
            .attr('value', cat)
            .text(cat);
    });

    let selectedTopCategory = "All";
    let selectedSubCategory = "All";

    categorySelect.on('change', function() {
        selectedTopCategory = this.value;
        subcategorySelect.selectAll('option').remove();
        subcategorySelect.append('option').attr('value', 'All').text('All');

        if (selectedTopCategory !== "All") {
            const subs = subcategoriesMap[selectedTopCategory];
            if (subs) {
                subs.forEach(s => {
                    subcategorySelect
                        .append('option')
                        .attr('value', s)
                        .text(s);
                });
            }
        }
        subcategorySelect.property('value', 'All');
        selectedSubCategory = "All";
        if (selectedTopCategory === "All"){
        globalState.update({
            type: 'broad',
            category: null,
            subcategory: null,
            node: null
        });
    } else if (selectedSubCategory === "All"){
        globalState.update({
            type: 'broad',
            category: selectedTopCategory,
            subcategory: null,
            node: null
    });}else if (selectedSubCategory !== "All"){
        globalState.update({
            type: 'broad',
            category: selectedTopCategory,
            subcategory: selectedSubCategory,
            node: null
    });}});

    subcategorySelect.on('change', function() {
        selectedSubCategory = this.value;
        
        if (selectedTopCategory === "All"){
        globalState.update({
            type: 'broad',
            category: null,
            subcategory: null,
            node: null
        });
    } else if (selectedSubCategory === "All"){
        globalState.update({
            type: 'broad',
            category: selectedTopCategory,
            subcategory: null,
            node: null
    });}else if (selectedSubCategory !== "All"){
        globalState.update({
            type: 'lessbroad',
            category: selectedTopCategory,
            subcategory: selectedSubCategory,
            node: null
    });}
    
    });

    //------------------------------------------------
    // 10) UPDATE GRAPH FUNCTION (CATEGORY FILTERING)
    //------------------------------------------------

    function updateGraph(topCat, subCat) {
        // 1) Filter nodes
        let filteredNodes = allNodes;
        if (topCat !== "All") {
            filteredNodes = filteredNodes.filter(n => getTopCategoryName(n) === topCat);
            if (subCat !== "All") {
                filteredNodes = filteredNodes.filter(n => n.category === subCat);
            }
        }
    
        const validIds = new Set(filteredNodes.map(n => n.id));
    
        // 2) Filter links so that source & target are both in filtered nodes
        const filteredLinks = allLinks.filter(l =>
            validIds.has(l.source.id) && validIds.has(l.target.id)
        );
    
        // 3) Update nodes
        node = node.data(filteredNodes, d => d.id);
        node.exit().remove();
    
        const nodeEnter = node.enter().append('circle')
            .attr('r', d => Math.max(2, d.linkCount * 0.5 * scale))
            .attr('fill', d => colorScaleDepth1(getTopCategoryName(d)))
            .call(d3.drag()
                .on('start', dragStarted)
                .on('drag', dragged)
                .on('end', dragEnded))
            .on('mouseover', function(event, d) {
                tooltip.transition().style('opacity', 1);
                tooltip.html(`
                    <strong>${d.name}</strong><br>
                    <em>Category:</em> ${d.broaderCategory}<br>
                    <em>Sub-Category:</em> ${d.category}<br>
                    ${d.author ? `<em>Author:</em> ${d.author}<br>` : ''} 
                    ${d.wordCount ? `<em>Number of citations:</em> ${d.linkCount}<br>` : ''}
                `)
                .style('left', `${event.pageX + 10}px`)
                .style('top', `${event.pageY + 10}px`);
            })
            .on('mousemove', function(event) {
                tooltip
                    .style('left', `${event.pageX + 10}px`)
                    .style('top', `${event.pageY + 10}px`);
            })
            .on('mouseout', function() {
                tooltip.transition().style('opacity', 0);
            })
            .on('click', function(event, d) {
                globalState.update({
                    type: 'single',
                    category: null,
                    subcategory: null,
                    node: d
                });
            });
    
        node = nodeEnter.merge(node);
    
        // 4) Update links
        link = link.data(filteredLinks, d => d.source.id + '-' + d.target.id);
        link.exit().remove();
    
        const linkEnter = link.enter().append('line')
            .attr('stroke', d => colorScaleDepth1(getTopCategoryName(d.source)))
            .attr('stroke-opacity', 0.6)
            .attr('stroke-width', 0.5);
    
        link = linkEnter.merge(link);
    
        // 5) Update labels
        const topFilteredNodes = [...filteredNodes]
            .sort((a, b) => b.linkCount - a.linkCount)
            .slice(0, 10);
        const topFilteredNodeIds = new Set(topFilteredNodes.map(n => n.id));
    
        label = label.data(filteredNodes.filter(n => topFilteredNodeIds.has(n.id)), d => d.id);
        label.exit().remove();
    
        const labelEnter = label.enter().append('text')
            .attr('text-anchor', 'middle')
            .style('font-weight', 'bold')
            .style('font-size', `${80 * scale}px`)
            .text(d => d.name);
    
        label = labelEnter.merge(label);
    
        // 6) Restart the simulation
        simulation.nodes(filteredNodes);
        simulation.force('link').links(filteredLinks);
        simulation.alpha(1).restart();
    
        // 7) On each tick, reposition elements
        simulation.on('tick', () => {
            link
                .attr('x1', d => d.source.x)
                .attr('y1', d => d.source.y)
                .attr('x2', d => d.target.x)
                .attr('y2', d => d.target.y);
    
            node
                .attr('cx', d => d.x)
                .attr('cy', d => d.y);
    
            label
                .attr('x', d => d.x)
                .attr('y', d => d.y - 10);
        });
    
        // 8) Adjust the view if necessary
        incrementZoom(0.01);
        // then i fit the view a couple of times according to the current positioning of the nodes so I dont have to wait until the simulation has fully ended

    }
    

    //------------------------------------------------
    // 11) UPDATE GRAPH FOR A CLICKED NODE
    //------------------------------------------------

    function updateGraphForNode(clickedNode) {
        // 1) Find the neighbors of the clicked node (itself + directly connected nodes)
        const neighbors = new Set([clickedNode.id]);
    
        allLinks.forEach(linkObj => {
            if (linkObj.source.id === clickedNode.id) {
                neighbors.add(linkObj.target.id);
            } else if (linkObj.target.id === clickedNode.id) {
                neighbors.add(linkObj.source.id);
            }
        });
    
        // 2) Filter nodes and links to include only the clicked node and its neighbors
        const filteredNodes = allNodes.filter(n => neighbors.has(n.id));
        const validIds = new Set(filteredNodes.map(n => n.id));
        const filteredLinks = allLinks.filter(l =>
            validIds.has(l.source.id) && validIds.has(l.target.id)
        );
    
        // 3) Update nodes
        node = node.data(filteredNodes, d => d.id);
        node.exit().remove();
    
        const nodeEnter = node.enter().append('circle')
            .attr('r', d => Math.max(2, d.linkCount * 0.5 * scale))
            .attr('fill', d => colorScaleDepth1(getTopCategoryName(d)))
            .call(d3.drag()
                .on('start', dragStarted)
                .on('drag', dragged)
                .on('end', dragEnded))
            .on('mouseover', function(event, d) {
                tooltip.transition().style('opacity', 1);
                tooltip.html(`
                    <strong>${d.name}</strong><br>
                    <em>Category:</em> ${d.broaderCategory}<br>
                    <em>Sub-Category:</em> ${d.category}<br>
                    ${d.author ? `<em>Author:</em> ${d.author}<br>` : ''} 
                    ${d.wordCount ? `<em>Number of citations:</em> ${d.linkCount}<br>` : ''}
                `)
                .style('left', `${event.pageX + 10}px`)
                .style('top', `${event.pageY + 10}px`);
            })
            .on('mousemove', function(event) {
                tooltip
                    .style('left', `${event.pageX + 10}px`)
                    .style('top', `${event.pageY + 10}px`);
            })
            .on('mouseout', function() {
                tooltip.transition().style('opacity', 0);
            })
            .on('click', function(event, d) {
                globalState.update({
                    type: 'single',
                    category: null,
                    subcategory: null,
                    node: d
                }); // Allow further drilling down
            });
    
        node = nodeEnter.merge(node);
    
        // 4) Update links
        link = link.data(filteredLinks, d => d.source.id + '-' + d.target.id);
        link.exit().remove();
    
        const linkEnter = link.enter().append('line')
            .attr('stroke', d => colorScaleDepth1(getTopCategoryName(d.source)))
            .attr('stroke-opacity', 0.6)
            .attr('stroke-width', 0.5);
    
        link = linkEnter.merge(link);
    
        // 5) Update labels
        const topNeighbors = [...filteredNodes]
            .sort((a, b) => b.linkCount - a.linkCount)
            .slice(0, 10);
        const topNeighborIds = new Set(topNeighbors.map(n => n.id));
    
        label = label.data(filteredNodes.filter(n => topNeighborIds.has(n.id)), d => d.id);
        label.exit().remove();
    
        const labelEnter = label.enter().append('text')
            .attr('text-anchor', 'middle')
            .style('font-weight', 'bold')
            .style('font-size', `${80 * scale}px`)
            .text(d => d.name);
    
        label = labelEnter.merge(label);
    
        // 6) Restart the simulation with the new subset
        simulation.nodes(filteredNodes);
        simulation.force('link').links(filteredLinks);
        simulation.alpha(1).restart();
    
        // 7) Adjust the view (fitView)
        fitView();
        setTimeout(fitView, 100); // Adjust view after layout starts
        setTimeout(fitView, 1000); // Final adjustment after more stabilization
    
        // 8) On each tick, reposition elements
        simulation.on('tick', () => {
            link
                .attr('x1', d => d.source.x)
                .attr('y1', d => d.source.y)
                .attr('x2', d => d.target.x)
                .attr('y2', d => d.target.y);
    
            node
                .attr('cx', d => d.x)
                .attr('cy', d => d.y);
    
            label
                .attr('x', d => d.x)
                .attr('y', d => d.y - 10);
        });
    }
    

    // Finally, initialize the graph with everything
    updateGraph("All", "All");

    globalState.subscribe((view) => {

        if (view.type === 'broad' && view.category) {
            selectedTopCategory= view.category;
            selectedSubCategory= "All";
            categorySelect.property('value', selectedTopCategory);
            subcategorySelect.selectAll('option').remove();
        subcategorySelect.append('option').attr('value', 'All').text('All');

        if (selectedTopCategory !== "All") {
            const subs = subcategoriesMap[selectedTopCategory];
            if (subs) {
                subs.forEach(s => {
                    subcategorySelect
                        .append('option')
                        .attr('value', s)
                        .text(s);
                });
            }
        }
            subcategorySelect.property('value', "All");
            updateGraph(selectedTopCategory,selectedSubCategory);}
        else if (view.type === 'broad' && !view.category){
            selectedTopCategory= "All";
            selectedSubCategory= "All";

            subcategorySelect.selectAll('option').remove();
        subcategorySelect.append('option').attr('value', 'All').text('All');
            
            categorySelect.property('value', selectedTopCategory);
            subcategorySelect.property('value', selectedSubCategory);
            updateGraph(selectedTopCategory,selectedSubCategory);}
        else if (view.type === 'lessbroad'){
                selectedTopCategory= view.category;
                selectedSubCategory= view.subcategory;
                
                categorySelect.property('value', selectedTopCategory);

                subcategorySelect.selectAll('option').remove();
        subcategorySelect.append('option').attr('value', 'All').text('All');

        if (selectedTopCategory !== "All") {
            const subs = subcategoriesMap[selectedTopCategory];
            if (subs) {
                subs.forEach(s => {
                    subcategorySelect
                        .append('option')
                        .attr('value', s)
                        .text(s);
                });
            }}
                subcategorySelect.property('value', selectedSubCategory);

                updateGraph(selectedTopCategory,selectedSubCategory);}
        else if (view.type === 'single' && view.node){
            updateGraphForNode(view.node)
        }





    });
}
