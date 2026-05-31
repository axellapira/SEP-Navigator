import globalState from './globalState.js';
import userData from './userData.js';
 
 export function drawTreeMap(data, container) {
    const margin = { top: 0, right: 30, bottom: 0, left: 0 };
    const containerWidth = document.querySelector(container).offsetWidth;
    const width = (containerWidth - margin.left - margin.right);
    const height = 800 - margin.top - margin.bottom;

    const breadcrumb = d3.select(container)
        .append('div')
        .attr('id', 'treemap-breadcrumb');

    // Inline SEP article preview (iframe overlay)
    const previewOverlay = d3.select(container)
        .append('div')
        .attr('id', 'treemap-preview')
        .classed('hidden', true);

    const previewBar = previewOverlay.append('div').attr('class', 'preview-bar');
    const previewTitle = previewBar.append('div').attr('class', 'preview-title');
    const previewActions = previewBar.append('div').attr('class', 'preview-actions');
    const starBtn = previewActions.append('button')
        .attr('class', 'preview-btn preview-star')
        .attr('title', 'Save to Reading List');
    starBtn.on('click', () => {
        if (!currentPreviewId) return;
        userData.toggleSave(currentPreviewId, currentPreviewMeta || {});
        updateStarButton();
    });
    previewActions.append('button')
        .attr('class', 'preview-btn preview-open')
        .attr('title', 'Open on plato.stanford.edu')
        .html('Open ↗')
        .on('click', () => {
            const url = previewIframe.attr('src');
            if (url) {
                if (currentPreviewId) userData.markRead(currentPreviewId);
                window.open(url, '_blank');
            }
        });
    const previewIframe = previewOverlay.append('iframe')
        .attr('class', 'preview-iframe')
        .attr('referrerpolicy', 'no-referrer')
        .attr('sandbox', 'allow-same-origin allow-scripts allow-popups allow-forms');

    let currentPreviewId = null;
    let currentPreviewMeta = null;
    function updateStarButton() {
        const isSaved = currentPreviewId && userData.isSaved(currentPreviewId);
        starBtn.html(isSaved ? '★' : '☆');
        starBtn.classed('is-saved', !!isSaved);
        starBtn.attr('title', isSaved ? 'Remove from Reading List' : 'Save to Reading List');
    }

    function showPreview(name, url, topCategory, id) {
        previewTitle.text(name);
        previewIframe.attr('src', url);
        const color = topCategory ? colorScaleDepth1(topCategory) : '#8c1515';
        previewOverlay.style('--preview-accent', color);
        previewOverlay.classed('hidden', false);
        currentPreviewId = id || name;
        currentPreviewMeta = { name, url, topCategory: topCategory || null };
        userData.markRead(currentPreviewId);
        updateStarButton();
    }
    function hidePreview() {
        previewOverlay.classed('hidden', true);
        previewIframe.attr('src', '');
        currentPreviewId = null;
        currentPreviewMeta = null;
    }
    // Refresh star icon when storage changes from elsewhere
    userData.subscribe(() => updateStarButton());

    // Dynamic dimensions — width/height follow the container body, clamped to limits
    // so we don't over-tile when extreme aspect ratios occur.
    const MIN_TREEMAP_W = 320, MAX_TREEMAP_W = 1600;
    const MIN_TREEMAP_H = 380, MAX_TREEMAP_H = 1400;

    let dynWidth = Math.max(MIN_TREEMAP_W, Math.min(MAX_TREEMAP_W, containerWidth - margin.left - margin.right));
    let dynHeight = Math.max(MIN_TREEMAP_H, Math.min(MAX_TREEMAP_H, height));

    const svg = d3.select(container)
  .append('svg')
  .attr('viewBox', `0 0 ${dynWidth + margin.left + margin.right} ${dynHeight + margin.top + margin.bottom}`)
  .attr('preserveAspectRatio', 'xMidYMid meet')
  .style('width', '100%')
  .style('height', '100%')
  .style('display', 'block');

svg.append("defs")
  .append("clipPath")
  .attr("id", "treemapClip")
  .append("rect")
  .attr("width", dynWidth)
  .attr("height", dynHeight);

const clippedGroup = svg.append('g')
  .attr('clip-path', 'url(#treemapClip)')
  .attr('transform', `translate(${margin.left}, ${margin.top})`);


    // Original root hierarchy ("PHILOSOPHY")
    const originalRoot = d3.hierarchy(data.hierarchy)
        .sum(d => +d.word_count || 2000) // this used to be when I wanted to make use of the word count, but I don't anymore. However, taking this off creates problems so it stays.
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
        .size([dynWidth, dynHeight])
        .paddingInner(d => d.depth === 0 ? 5 : 2)
        .paddingOuter(d => 5)
        .paddingTop(d => d.depth === 0 ? 40 : 20);

        const myWarmVariedColors = [
            "#db4848", // History of Philosophy (slightly darker)
            "#E69300", // Moral Philosophy
            "#65C977", // Metaphysics
            "#B874D9", // Philosophy of Knowledge (slightly darker)
            "#5CAFFD"  // Logic
        ];
        
        
        
        

    const colorScaleDepth1 = d3.scaleOrdinal(myWarmVariedColors);
//tooltip parameters
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
    
        
    //Helper to press the button twice which is needed

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
                    //update the global state to update the network
                    
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

            if (relativeDepth === 0 && d.data._originalDepth != 3) {
                return d.data.name || 'Root';
            }
            if (relativeDepth === 0 && d.data._originalDepth == 3) {
                return d.data.name;
            }
            if (relativeDepth === 1) {
                return d.data.name;
            }
            if (relativeDepth === 2 && d.data._originalDepth != 3) {
                return d.data.name;
            }
            return '';
        }
        
        

    function getFontSize(d) {
        const depth = d.data._originalDepth;
        // Scale font down progressively to fit cell width.
        const cellW = d.x1 - d.x0;
        const cellH = d.y1 - d.y0;
        let base;
        if (depth === 0) base = 20;
        else if (depth === 1) base = 16;
        else if (depth === 2) base = 13;
        else base = 11;
        // Shrink if cell is small.
        if (cellW < 90 || cellH < 28) base = Math.min(base, 11);
        if (cellW < 60 || cellH < 22) base = Math.min(base, 10);
        return base + 'px';
    }

    function truncateLabel(text, cellWidth, fontSizePx) {
        if (!text) return '';
        // Rough character-per-px estimate for current font.
        const approxCharWidth = fontSizePx * 0.55;
        const maxChars = Math.max(3, Math.floor((cellWidth - 10) / approxCharWidth));
        if (text.length <= maxChars) return text;
        return text.slice(0, Math.max(1, maxChars - 1)) + '…';
    }

    function getFontWeight(d) {
        const depth = d.data._originalDepth;
        return (depth === 0 || depth === 1) ? 'bold' : 'normal';
    }

    function getColor(d) {
        const depth = d.data._originalDepth;
        const topCat = d.data._topCategory;
        if (depth === 0) {
            return '#8c1515';
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
            return parentColor; //Makes saturation and lightness higher as depth increases
        }
    }

    function update(currentRoot) {
        treemap(currentRoot);
        // Whenever the treemap re-renders, close any open inline preview
        hidePreview();
        const breadcrumbParts = path.map(p => p.data.name);
        breadcrumb.text('Path: ' + breadcrumbParts.join(' > '));
        // Toggle nav state: at root nothing to go back to.
        document.body.classList.toggle('at-root', path.length <= 1);
        const nodes = clippedGroup.selectAll('g.node')
  .data(currentRoot.descendants(), d => d.data.name);

// Continue with the rest of your node logic as is.


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
            .attr('stroke', 'rgba(255,255,255,0.85)')
            .attr('stroke-width', 1)
            .attr('rx', d => d.data._originalDepth === 3 ? 3 : 2)
            .attr('ry', d => d.data._originalDepth === 3 ? 3 : 2)
            .style('cursor', d => (d.data.article_url || d.children) ? 'pointer' : 'default')
            .on('mouseover', function (event, d) {
                if (d.data._originalDepth == 3){
                tooltip.style('display', 'block')
                    .html(`
                        <strong>${d.data.name}</strong><br/>
                        ${d.data.author ? `Author: ${d.data.author}<br/>` : ''}
                        <em style="color:#8c1515">Click to read the article →</em>
                    `);}
                else{
                    tooltip.style('display', 'block')
                    .html(`
                        <strong>${d.data.name}</strong><br/>
                        ${d.data.author ? `Author: ${d.data.author}<br/>` : ''}
                    `);
                }
                d3.select(this).attr('stroke', '#222').attr('stroke-width', 1.5);
            })
            .on('mousemove', function (event) {
                tooltip.style('left', (event.pageX + 10) + 'px')
                    .style('top', (event.pageY + 10) + 'px');
            })
            .on('mouseout', function () {
                tooltip.style('display', 'none');
                d3.select(this).attr('stroke', 'rgba(255,255,255,0.85)').attr('stroke-width', 1);
            })
            .on('click', function (event, d) {
                if (d.data.article_url) {
                    const id = d.data.id || d.data.name;
                    showPreview(d.data.name, d.data.article_url, d.data._topCategory, id);
                    // Also filter the network graph to this node + neighbors,
                    // matching what happens when you click a node in the network.
                    globalState.update({
                        type: 'single',
                        category: null,
                        subcategory: null,
                        node: {
                            id: d.data.id || d.data.name,
                            name: d.data.name,
                            category: d.data.category || d.parent?.data.name || null,
                            broaderCategory: d.data._topCategory || null,
                            articleUrl: d.data.article_url
                        }
                    });
                } else if (d.children) {
                    // Zoom into subtree
                    let targetNode = findOriginalNodeByName(originalRoot, d.data.name);
                    if (targetNode) {
                        
                        path.push(targetNode);
                        let newRoot = d3.hierarchy(path[path.length-1].data)
                            .sum(d => +d.word_count || 2000)
                            .sort((a, b) => b.value - a.value);
                            //updates GlobalState
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
            .attr('x', 6)
            .attr('y', d => d.data._originalDepth === 0 ? 26 : 16)
            .text(d => {
                const raw = getNodeText(d, currentRoot);
                const fs = parseInt(getFontSize(d), 10);
                return truncateLabel(raw, d.x1 - d.x0, fs);
            })
            .attr('font-size', getFontSize)
            .attr('fill', d => d.data._originalDepth === 0 ? '#fff' : '#1f1718')
            .style('pointer-events', 'none')
            .style('font-weight', getFontWeight);

        // Read/saved indicator (small corner dot) — only on article leaves
        nodeEnter.append('circle')
            .attr('class', 'user-indicator')
            .attr('r', 4)
            .style('pointer-events', 'none');

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
            .attr('font-size', getFontSize)
            .attr('fill', d => d.data._originalDepth === 0 ? '#fff' : '#1f1718')
            .text(d => {
                const raw = getNodeText(d, currentRoot);
                const fs = parseInt(getFontSize(d), 10);
                return truncateLabel(raw, d.x1 - d.x0, fs);
            })
            .style('display', d => {
                const w = d.x1 - d.x0;
                const h = d.y1 - d.y0;
                // Hide cramped labels to reduce clutter and overlap.
                return (w < 60 || h < 20) ? 'none' : 'block';
            });

        // Position + color the user-state indicator (article leaves only)
        nodeUpdate.select('circle.user-indicator')
            .attr('cx', d => (d.x1 - d.x0) - 8)
            .attr('cy', 8)
            .attr('fill', d => userData.isSaved(d.data.id || d.data.name) ? '#e0aa3e'
                              : userData.isRead(d.data.id || d.data.name) ? 'rgba(255,255,255,0.95)'
                              : 'transparent')
            .attr('stroke', d => userData.isSaved(d.data.id || d.data.name) ? '#a47620'
                                : userData.isRead(d.data.id || d.data.name) ? 'rgba(0,0,0,0.25)'
                                : 'transparent')
            .attr('stroke-width', 1)
            .style('display', d => {
                if (d.data._originalDepth !== 3) return 'none';
                const w = d.x1 - d.x0;
                const h = d.y1 - d.y0;
                if (w < 30 || h < 20) return 'none';
                const id = d.data.id || d.data.name;
                return (userData.isRead(id) || userData.isSaved(id)) ? 'block' : 'none';
            });

    }

    // Refresh indicators when userData changes.
    userData.subscribe(() => {
        if (typeof initialRoot !== 'undefined') {
            // Re-run the update for current root to refresh indicators only.
            const currentRoot = d3.hierarchy(path[path.length - 1].data)
                .sum(d => +d.word_count || 2000)
                .sort((a, b) => b.value - a.value);
            treemap(currentRoot);
            // Just re-style the existing indicators without full rebuild
            clippedGroup.selectAll('g.node').select('circle.user-indicator')
                .attr('fill', d => userData.isSaved(d.data.id || d.data.name) ? '#e0aa3e'
                                  : userData.isRead(d.data.id || d.data.name) ? 'rgba(255,255,255,0.95)'
                                  : 'transparent')
                .style('display', d => {
                    if (d.data._originalDepth !== 3) return 'none';
                    const id = d.data.id || d.data.name;
                    return (userData.isRead(id) || userData.isSaved(id)) ? 'block' : 'none';
                });
        }
    });

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
        // view is the updated globalState.currentView
       
        

    
        if (view.type === 'broad' && view.category) {

            
            // filter or zoom the treemap to that broad category
            let targetNode = findOriginalNodeByName(originalRoot, view.category);
                    if (targetNode) {
                        if (!lastbuttonisBack){path.push(targetNode);
                            
                        }
                        lastbuttonisBack = false; // now it doesn't have to re-push the same node back again 
                        if (path.length >1){
                            let newRoot = d3.hierarchy(path[path.length-1].data)
                                .sum(d => +d.word_count || 2000)
                                .sort((a, b) => b.value - a.value);
                            treemap(newRoot);
                            
                            update(newRoot);}
                             else{
                                path.push(targetNode);
                                console.log(path)
    
                                let newRoot = d3.hierarchy(path[path.length-1].data)
                                .sum(d => +d.word_count || 2000)
                                .sort((a, b) => b.value - a.value);
                            treemap(newRoot);
                            
                            update(newRoot);}}
                        
                    }else if (view.type === 'lessbroad') {
            
            let targetNode = findOriginalNodeByName(originalRoot, view.subcategory);
                    if (targetNode) {

                        if (!lastbuttonisBack){
                            path.push(targetNode); 
                            console.log(path)
                        }
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
                        console.log(path)

                        lastbuttonisBack = false;

                        if (path.length >1){
                        let newRoot = d3.hierarchy(path[path.length-1].data)
                            .sum(d => +d.word_count || 2000)
                            .sort((a, b) => b.value - a.value);
                        treemap(newRoot);

                        update(newRoot);}
                         else{
                            path.push(targetNode);
                            console.log(path)

                            let newRoot = d3.hierarchy(path[path.length-1].data)
                            .sum(d => +d.word_count || 2000)
                            .sort((a, b) => b.value - a.value);
                        treemap(newRoot);

                        update(newRoot);
                        }

                        // After re-render, if the target is an article, show inline SEP preview
                        const url = targetNode.data.article_url || view.node.articleUrl;
                        if (url) {
                            const topCat = targetNode.data._topCategory || view.node.broaderCategory || view.node.category;
                            const id = view.node.id || targetNode.data.id || targetNode.data.name;
                            showPreview(targetNode.data.name, url, topCat, id);
                        }
                    }
        }
      });

 

    // Initial draw with full root at philosophy
    let initialRoot = d3.hierarchy(path[0].data)
        .sum(d => +d.word_count || 2000)
        .sort((a, b) => b.value - a.value);
    treemap(initialRoot);
    update(initialRoot);

    // ResizeObserver — re-tile when container size meaningfully changes.
    const containerEl = document.querySelector(container);
    if (containerEl && 'ResizeObserver' in window) {
        let lastW = dynWidth, lastH = dynHeight;
        let pending = null;
        const ro = new ResizeObserver(entries => {
            const e = entries[0];
            if (!e) return;
            const newW = Math.max(MIN_TREEMAP_W, Math.min(MAX_TREEMAP_W, e.contentRect.width));
            const newH = Math.max(MIN_TREEMAP_H, Math.min(MAX_TREEMAP_H, e.contentRect.height));
            // Only re-tile past a meaningful change (~6%)
            const dW = Math.abs(newW - lastW) / lastW;
            const dH = Math.abs(newH - lastH) / lastH;
            if (dW < 0.06 && dH < 0.06) return;
            clearTimeout(pending);
            pending = setTimeout(() => {
                dynWidth = newW; dynHeight = newH;
                lastW = newW; lastH = newH;
                svg.attr('viewBox', `0 0 ${dynWidth + margin.left + margin.right} ${dynHeight + margin.top + margin.bottom}`);
                svg.select('defs clipPath rect').attr('width', dynWidth).attr('height', dynHeight);
                treemap.size([dynWidth, dynHeight]);
                const currentRoot = d3.hierarchy(path[path.length - 1].data)
                    .sum(d => +d.word_count || 2000)
                    .sort((a, b) => b.value - a.value);
                update(currentRoot);
            }, 120);
        });
        ro.observe(containerEl);
    }
}


