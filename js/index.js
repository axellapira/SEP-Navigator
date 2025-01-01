// index.js
import { drawTreeMap } from './tree_map.js';
import { drawLargeNetwork } from './large_network.js';
import globalState from './globalState.js';

// etc...

// Initialize the visualizations
function initializeVisualizations() {
  // Load the data
  d3.json('data/data.json').then((data) => {
      // Draw the Treemap
      drawTreeMap(data, '#treeMapContainer');

      // Draw the Large Network
      drawLargeNetwork(data, '#largeNetworkContainer');

      globalState.update({
        type: 'broad',
        category: null,
        subcategory: null,
        node: null
      });

      console.log("Visualizations initialized");
  }).catch((error) => {
      console.error("Error loading data:", error);
  });
}

const helpButton = document.getElementById("help-button");
const helpOverlay = document.getElementById("help-overlay");

helpButton.addEventListener("click", () => {
    helpOverlay.classList.toggle("hidden");
});

// Close overlay when clicking outside the help boxes
helpOverlay.addEventListener("click", (event) => {
  console.log("clicked")
    if (event.target.id === "help-overlay") {
      console.log("clicked correctlt")
        helpOverlay.classList.add("hidden");
    }
});

// Initialize all visualizations when the document is ready
initializeVisualizations();


