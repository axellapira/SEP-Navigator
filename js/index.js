
import { drawTreeMap } from './tree_map.js';
import { drawLargeNetwork } from './large_network.js';
import globalState from './globalState.js';
import userData from './userData.js';
import { initReadingList } from './reading_list.js';
import { initRandomArticle } from './random_article.js';
import { initSpeedrun, enterSetup as enterSpeedrunSetup } from './speedrun.js';
import { initCuriosities } from './curiosities.js';


// Initialise the visualisations
function initializeVisualizations() {
  // Load the data
  d3.json('data.json').then((data) => {
      // treemap
      drawTreeMap(data, '#treeMapBody');

      // network
      drawLargeNetwork(data, '#largeNetworkBody');

      // Random article button (now that data is loaded)
      initRandomArticle(data);
      initSpeedrun(data);
      initCuriosities(data);

      // Dock app for speedrun → enter setup
      const srDock = document.getElementById('dockSpeedrun');
      if (srDock) srDock.addEventListener('click', () => enterSpeedrunSetup());

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

if (helpButton) {
    helpButton.addEventListener("click", () => {
        helpOverlay.classList.toggle("hidden");
    });
}

// Help close button
const helpClose = document.getElementById("help-close");
if (helpClose) {
    helpClose.addEventListener("click", () => {
        helpOverlay.classList.add("hidden");
    });
}

// Close overlay when clicking outside the help boxes
helpOverlay.addEventListener("click", (event) => {
  console.log("clicked")
    if (event.target.id === "help-overlay") {
      console.log("clicked correctlt")
        helpOverlay.classList.add("hidden");
    }
});

// Reading list panel (independent of viz init)
initReadingList();

// Initialise
initializeVisualizations();




