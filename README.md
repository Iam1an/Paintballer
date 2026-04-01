# Paintballer

A browser-based multiplayer paintball game engine built with JavaScript.

## TO-DO

- Make user login system
- Leaderboard system
- UI refinements
- Probably need some sort of DB to store user info
- Secure server side stuff
- Make private games need codes and for public games remove the code so that private games can use them
- Ads (lol)

## Project Background

- Initial game & idea created by Ian.
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

- MIT