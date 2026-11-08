import { createReplay } from './replay.js';

const def = await (await fetch(new URL('six.json', import.meta.url))).json();
createReplay(document.getElementById('sixCourt'), def).start();
