
import { drawTreeMap } from './tree_map.js';
import { drawLargeNetwork } from './large_network.js';
import globalState from './globalState.js';


// Initialise the visualisations
function initializeVisualizations() {
  // Load the data
  d3.json('data.json').then((data) => {
      // treemap
      drawTreeMap(data, '#treeMapContainer');

      // network
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

// Initialise
initializeVisualizations();




