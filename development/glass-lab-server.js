const path = require('node:path');
const express = require('express');

if (process.env.NODE_ENV === 'production') {
  throw new Error('The Liquid Glass laboratory is development-only.');
}

const app = express();
const port = Number(process.env.GLASS_LAB_PORT || 3131);
app.get('/__dev/liquid-glass-lab', (req, res) => res.sendFile(path.join(__dirname, 'liquid-glass-lab.html')));
app.use('/__dev/assets', express.static(__dirname));
app.use(express.static(path.join(__dirname, '..', 'public')));
app.listen(port, () => console.log(`LocalPrice Liquid Glass lab is available at http://localhost:${port}/__dev/liquid-glass-lab`));
