import globalState from './globalState.js';
 
 export function drawTreeMap(data, container) {
    const margin = { top: 0, right: 30, bottom: 0, left: 0 };
    const containerWidth = document.querySelector(container).offsetWidth;
    const width = (containerWidth - margin.left - margin.right);
    const height = 800 - margin.top - margin.bottom;

    const svg = d3.select(container)
        .append('svg')
        .attr('width', width + margin.left + margin.right)
        .attr('height', height + margin.top + margin.bottom)
        .append('g')
        .attr('transform', `translate(${margin.left}, ${margin.top})`);

    // Original root hierarchy
    const originalRoot = d3.hierarchy(data.hierarchy)
        .sum(d => +d.word_count || 2000)
        .sort((a, b) => b.value - a.value);

    // Preprocess originalRoot to add stable metadata
    originalRoot.each(d => {
        d.data._originalDepth = d.depth;
        // Find top-level category (original depth=1 ancestor)
        let ancestor = d;
        while (ancestor && ancestor.depth > 1) {
            ancestor = ancestor.parent;
        }
        // If at least depth=1, record top-level category from that node
        d.data._topCategory = (ancestor && ancestor.depth === 1) ? ancestor.data.name : d.data.name;
    });

    let path = [originalRoot];

    const treemap = d3.treemap()
        .size([width, height])
        .paddingInner(d => d.depth === 0 ? 5 : 2)
        .paddingOuter(d => 5)
        .paddingTop(d => d.depth === 0 ? 40 : 20);

        const myWarmVariedColors = [
            "#D96666", // History of Philosophy
            "#E3A617", // Moral Phil
            "#6FAB78", // Metaphysics
            "#A982B4", // Phil of Knowledge
            "#5C99CC"  // Logic
        ];
        
        
        
        

    const colorScaleDepth1 = d3.scaleOrdinal(myWarmVariedColors);

    const tooltip = d3.select(container)
        .append('div')
        .attr('class', 'tooltip')
        .style('position', 'absolute')
        .style('background', '#fff')
        .style('padding', '10px')
        .style('border', '1px solid #ccc')
        .style('border-radius', '4px')
        .style('display', 'none')
        .style('pointer-events', 'none');

    let lastbuttonisBack = false;

    const controls = d3.select('#controls');
    controls.append('button')
    .attr('id', 'backButton')
        .text('Back')
        .on('click', () => {
            console.log("hello one")
            if (path.length > 1) {
                lastbuttonisBack = true
                const originalDepthofPoppedNode= path[path.length - 1].data._originalDepth;
                path.pop();
                const parentNode = path[path.length - 1];
                const parentRoot = d3.hierarchy(parentNode.data)
                    .sum(d => +d.word_count || 2000)
                    .sort((a, b) => b.value - a.value);
                    
                    const originalDepth = parentNode.data._originalDepth;
                    
                    if (originalDepth === 0) {
                        globalState.update({
                            type: 'broad',
                            category: null,
                            subcategory: null,
                            node: null
                        });
                    } else if (originalDepth === 1) {
                        
                        globalState.update({
                            type: 'broad',
                            category: parentNode.data.name,
                            subcategory: null,
                            node: null
                        });
                    } else if (originalDepth === 2) {
                        globalState.update({
                            type: 'lessbroad',
                            category: parentNode.parent?.data.name || null,
                            subcategory: parentRoot.data.name,
                            node: null
                        });
                    }
                    else if (originalDepth === 3){
                        globalState.update({
                            type: 'single',
                            category:  null,
                            subcategory: null,
                            node: parentRoot.data
                        });
                    } 
                    if (originalDepthofPoppedNode !== 3) {
                        console.log("Triggering second back click");
                        document.querySelector('#backButton').click();//for some reason when it's in non-node view i need to click twice to go back so this fixes it.
                    }
            }
        });

    controls.append('button')
        .text('Reset')
        .on('click', () => {
            path = [originalRoot];
            const currentRoot = d3.hierarchy(path[0].data)
                .sum(d => +d.word_count || 2000)
                .sort((a, b) => b.value - a.value);
                console.log("reset done")
                globalState.update({
                    type: 'broad',
                    category: null,
                    subcategory: null,
                    node: null
                });
                
        });

        function getNodeText(d, currentRoot) {
            const relativeDepth = d.depth - currentRoot.depth;
        
            if (relativeDepth === 0 && d.data._originalDepth!=3 ) {
                return d.data.name || 'Root'; // Current root node
            }
            if (relativeDepth === 0 && d.data._originalDepth==3) {
                return d.data.name + " (Click to read the Article!!)"; // Current root node
            }
            if (relativeDepth === 1 ) {
                return d.data.name; // Direct children of the current view
            }
            if (relativeDepth === 2 && d.data._originalDepth!=3 ){
                return d.data.name ; // Grandchildren of the current view
            }
            return ''; // Hide text for nodes deeper than grandchildren
        }
        
        

    function getFontSize(d) {
        const depth = d.data._originalDepth;
        if (depth === 0) return '20px';
        if (depth === 1) return '16px';
        if (depth === 2) return '12px';

        
        return '10px';
    }

    function getFontWeight(d) {
        const depth = d.data._originalDepth;
        return (depth === 0 || depth === 1) ? 'bold' : 'normal';
    }

    function getColor(d) {
        const depth = d.data._originalDepth;
        const topCat = d.data._topCategory;
        if (depth === 0) {
            return '#a6283b';
        } else if (depth === 1) {
            return colorScaleDepth1(topCat);
        } else if (depth === 2) {
            const parentColor = d3.hsl(colorScaleDepth1(topCat));
            parentColor.s -= 0.1;
            parentColor.l += 0.05;
            return parentColor;
        } else {
            const parentColor = d3.hsl(colorScaleDepth1(topCat));
            parentColor.s -= 0.2;
            parentColor.l += 0.15;
            return parentColor;
        }
    }

    function update(currentRoot) {
        treemap(currentRoot);
        const nodes = svg.selectAll('g.node')
            .data(currentRoot.descendants(), d => d.data.name);

        // EXIT old nodes
        nodes.exit().remove();

        // ENTER new nodes
        const nodeEnter = nodes.enter().append('g')
            .attr('class', 'node')
            .attr('transform', d => `translate(${d.x0}, ${d.y0})`);

        nodeEnter.append('rect')
            .attr('width', d => d.x1 - d.x0)
            .attr('height', d => d.y1 - d.y0)
            .attr('fill', getColor)
            .attr('stroke', '#fff')
            .on('mouseover', function (event, d) {
                if (d.data._originalDepth == 3){
                tooltip.style('display', 'block')
                    .html(`
                        <strong>${d.data.name + " (Click to read the article!)"}</strong><br/>
                        ${d.data.author ? `Author: ${d.data.author}<br/>` : ''}
                        
                    `);}
                else{
                    tooltip.style('display', 'block')
                    .html(`
                        <strong>${d.data.name}</strong><br/>
                        ${d.data.author ? `Author: ${d.data.author}<br/>` : ''}
                        
                    `);
                }
                d3.select(this).attr('stroke', 'black');
            })
            .on('mousemove', function (event) {
                tooltip.style('left', (event.pageX + 10) + 'px')
                    .style('top', (event.pageY + 10) + 'px');
            })
            .on('mouseout', function () {
                tooltip.style('display', 'none');
                d3.select(this).attr('stroke', '#fff');
            })
            .on('click', function (event, d) {
                if (d.data.article_url) {
                    window.open(d.data.article_url, '_blank');
                } else if (d.children) {
                    // Zoom into subtree
                    let targetNode = findOriginalNodeByName(originalRoot, d.data.name);
                    if (targetNode) {
                        
                        path.push(targetNode);
                        let newRoot = d3.hierarchy(path[path.length-1].data)
                            .sum(d => +d.word_count || 2000)
                            .sort((a, b) => b.value - a.value);
                            
                            if (targetNode.depth === 0) {
                                globalState.update({
                                    type: 'broad',
                                    category: null,
                                    subcategory: null,
                                    node: null
                                });
                            } else if (targetNode.depth === 1) {
                                globalState.update({
                                    type: 'broad',
                                    category: newRoot.data.name,
                                    subcategory: null,
                                    node: null
                                });
                            } else if (targetNode.depth === 2) {
                                globalState.update({
                                    type: 'lessbroad',
                                    category: targetNode.parent?.data.name || null,
                                    subcategory: newRoot.data.name,
                                    node: null
                                });
                            }
                    }
                }
                
            });

        nodeEnter.append('text')
            .attr('x', 5)
            .attr('y', d => d.data._originalDepth === 0 ? 25 : 15)
            .text(getNodeText)
            .attr('font-size', getFontSize)
            .attr('fill', '#000')
            .style('pointer-events', 'none')
            .style('font-weight', getFontWeight);

        // UPDATE
        const nodeUpdate = nodeEnter.merge(nodes);

        nodeUpdate.transition().duration(750)
            .attr('transform', d => `translate(${d.x0}, ${d.y0})`);

        nodeUpdate.select('rect')
            .transition().duration(750)
            .attr('width', d => d.x1 - d.x0)
            .attr('height', d => d.y1 - d.y0)
            .attr('fill', getColor);

            nodeUpdate.select('text')
        .text(d => getNodeText(d, currentRoot));
        
    }

    function findOriginalNodeByName(node, name) {
        if (node.data.name === name) return node;
        if (node.children) {
            for (let c of node.children) {
                let found = findOriginalNodeByName(c, name);
                if (found) return found;
            }
        }
        return null;
    }

    globalState.subscribe((view) => {

        console.log("Subscription fired: ", view);
        // `view` is the updated globalState.currentView
        // Reconstruct or re-filter your treemap based on that view.
        

    
        if (view.type === 'broad' && view.category) {

            
            // Filter or zoom the treemap to that broad category...
            let targetNode = findOriginalNodeByName(originalRoot, view.category);
                    if (targetNode) {
                        if (!lastbuttonisBack){path.push(targetNode);
                            
                        }
                        lastbuttonisBack = false; // now it doesn't have to re-push the same node back again 
                        let newRoot = d3.hierarchy(path[path.length-1].data)
                            .sum(d => +d.word_count || 2000)
                            .sort((a, b) => b.value - a.value);
                        treemap(newRoot);
                        update(newRoot);}
                        
                    }else if (view.type === 'lessbroad') {
            
            let targetNode = findOriginalNodeByName(originalRoot, view.subcategory);
                    if (targetNode) {

                        if (!lastbuttonisBack){path.push(targetNode);}
                        lastbuttonisBack = false;
                        let newRoot = d3.hierarchy(path[path.length-1].data)
                            .sum(d => +d.word_count || 2000)
                            .sort((a, b) => b.value - a.value);
                        treemap(newRoot);
                        
                        update(newRoot);}
        } else if (view.type === 'broad' && !view.category) {
            
            let initialRoot = d3.hierarchy(path[0].data).sum(d => +d.word_count || 2000)
                .sort((a, b) => b.value - a.value);
            treemap(initialRoot);
            update(initialRoot);
        } else if (view.type ==='single'&& view.node){
            let targetNode = findOriginalNodeByName(originalRoot, view.node.name);
                    if (targetNode) {
                        if (!lastbuttonisBack){path.push(targetNode);}
                        lastbuttonisBack = false;
                        
                        let newRoot = d3.hierarchy(path[path.length-1].data)
                            .sum(d => +d.word_count || 2000)
                            .sort((a, b) => b.value - a.value);
                        treemap(newRoot);
                        
                        update(newRoot);}
        }
      });

 

    // Initial draw with full root
    let initialRoot = d3.hierarchy(path[0].data)
        .sum(d => +d.word_count || 2000)
        .sort((a, b) => b.value - a.value);
    treemap(initialRoot);
    update(initialRoot);
}
