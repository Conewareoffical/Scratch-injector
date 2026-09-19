document.getElementById('injectBtn').addEventListener('click', async () => {
  const fileInput = document.getElementById('spriteInput');
  if (!fileInput.files.length) return alert('Select a .sprite3 file first.');

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab.url.includes("scratch.mit.edu/projects/")) {
    return alert("Please open a Scratch project page.");
  }

  // Convert the file to an ArrayBuffer, then to Base64 to safely pass it
  const arrayBuffer = await fileInput.files[0].arrayBuffer();
  const base64 = btoa(
    new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
  );

  // Execute the injection function directly in the webpage's memory (MAIN world)
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    world: "MAIN", 
    func: injectIntoScratchVM,
    args: [base64, fileInput.files[0].name]
  });
});

// --- EVERYTHING BELOW RUNS INSIDE THE SCRATCH WEBPAGE MEMORY ---
function injectIntoScratchVM(base64Data, filename) {
  console.log(`[Injector] Attempting to memory-inject ${filename}...`);

  // 1. Convert Base64 back into raw binary memory (ArrayBuffer)
  const binaryStr = atob(base64Data);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  const spriteBuffer = bytes.buffer;

  // 2. Scan the page's React Fiber tree to find the hidden Scratch VM object
  let vm = null;
  const rootElements = document.querySelectorAll('#app, div[class^="stage-wrapper"]');
  
  for (let el of rootElements) {
    const reactKeys = Object.keys(el).filter(k => k.startsWith('__reactInternalInstance$') || k.startsWith('__reactFiber$'));
    for (let key of reactKeys) {
      let node = el[key];
      while (node) {
        if (node.stateNode && node.stateNode.props && node.stateNode.props.vm) {
          vm = node.stateNode.props.vm;
          break;
        }
        if (node.memoizedProps && node.memoizedProps.vm) {
          vm = node.memoizedProps.vm;
          break;
        }
        node = node.return;
      }
    }
    if (vm) break;
  }

  if (!vm) {
    alert("Injector Error: Could not find the Scratch VM in memory.");
    return;
  }

  // 3. Force the game engine to load the sprite buffer
  try {
    vm.addSprite(spriteBuffer).then(() => {
      console.log(`[Injector] Successfully injected hack sprite into game state!`);
      // Start the game loop just in case it was paused
      vm.greenFlag(); 
    }).catch(e => {
      console.error("[Injector] VM rejected the sprite:", e);
      alert("Injector Error: The game engine crashed trying to load the sprite.");
    });
  } catch (err) {
    console.error(err);
  }
}