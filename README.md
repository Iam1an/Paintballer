# Paintballer

A browser-based multiplayer paintball game engine built with JavaScript.

## Project Background

- Initial game created by Ian.
- UI refinement, multiplayer lobby system, and hosting setup done by gheat.
- Hosted at: https://gheat.net/paintballer/

## Features

- 2D paintball combat mechanics
- Multiplayer with lobby support
- Procedural map/world generation
- AI and pathfinding components
- UI overlays for health, score, and lobby controls

## Architecture

- `index.html`: entry point
- `css/style.css`: UI styles
- `js/`: core game logic
  - `game.js`, `world.js`, `render.js`, `input.js`, etc.
- `evolve/`: genetic algorithm and simulation utilities for AI tuning
- `server.js`: backend multiplayer server logic

## Run Locally

1. `npm install`
2. `npm start` or `node server.js`
3. Open `http://localhost:3000` (or configured port)

## Contribution Notes

- `Ian` - game core logic and gameplay design
- `gheat` - UI polish, multiplayer lobby features, hosting deployment

## License

Add your preferred license here (MIT, Apache, etc.)
