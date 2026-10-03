# Changelog

## 1.14.0 · 3 October 2026

### Added
- **Tracer API billing per photo.** Each partner key can have a price per photo and a number of free photos a month. Only photos that traced count, and test keys are never billed. Each month's total goes on the paying account's next invoice as one line. `GET /trace/v1` now shows the key's price and what this month owes so far.
- **Tracer billing in the admin.** Settings shows each key's price, who pays and this month's total. You can set a price when you issue a key or change it later, and see every monthly bill (on an invoice, or marked for invoicing by hand when there's no card on file).

## 1.13.0 · 3 October 2026

### Added
- **Live failure watch** (`POST /ai/v1/watch/frame?job=`). Send camera frames while a print runs. You get back continue, check or pause. Pause only comes when two frames in a row show a print-ending fault (spaghetti, layer shift, clog, layers splitting). One frame every 20 seconds per job.

### Fixed
- **Settings checks read PrusaSlicer `.ini` files.** Plain `key = value` lines now count, not just the `; key = value` lines inside G-code.

## 1.12.0 · 3 October 2026

### Added
- **Get set up, in the console.** A six-step checklist on the overview for new accounts: make a key, try a test key, make your first file, lock a key, add a webhook, bring your team. Each step ticks itself off, and you can hide the checklist.
- **Teams in the admin.** Developers now lists every team with its owner (who pays), people and pending invites, shared keys and calls today, plus a link to the owner's console.

### Changed
- The console and admin use the full width of very wide screens (up to 3000 px of content).

## 1.11.0 · 3 October 2026

### Added
- **Teams.** Start a team in the console's new Team tab and invite people by handle or email. They join when they accept.
  - Team keys are shared: everyone in the team sees them and the calls they make.
  - They run on the team owner's plan, so the owner's limits and bill apply, and they count toward the owner's keys.
  - Roles: the owner and admins make, lock, limit and revoke team keys; members use them. Only the owner invites admins and changes roles.
  - Up to 10 people a team, 3 teams owned per account. Closing a team revokes its keys straight away.

## 1.10.0 · 3 October 2026

### Added
- **Test keys.** Tick "Test key" in the console to make a `vx_test_…` key.
  - Every call is checked exactly like a real one, so your code meets the real errors.
  - Files come back as a 20 mm test cube, and photo diagnosis returns a sample report.
  - Nothing counts against your plan, and test keys work even before an API is switched on.

## 1.9.0 · 3 October 2026

### Added
- **A changelog feed for developers.** Every new feature and fix, newest first: `/changelog.rss` for feed readers and chat channels, `GET /api/changelog` as JSON, and the latest five in the docs under Versions and changes.
- **SDKs for JavaScript and Python** (`/sdk/mintmotive.mjs`, `/sdk/mintmotive.py`). They have no dependencies and cover the Engine, Tracer and Print AI APIs. Errors come back as exceptions with the status, the message and the request id.
- **Each key's own limits.** In the console, any key can have its own cap on calls a day and on extra use a month, on top of your account's limits. A key at its cap is told which cap it hit, and your other keys carry on.

## 1.8.0 · 3 October 2026

### Added
- **The Print AI API** (`/ai/v1`). It checks a 3D print at every step and says exactly which setting to change, to what, and why.
  - **Before slicing:** `POST /ai/v1/check/model` takes an STL or 3MF, or any Engine API model by kind and settings. It reports:
    - size, volume and whether the mesh is closed;
    - overhangs, bridges and how much sits on the bed;
    - the six flat ways the model could lie, with the best one;
    - whether it fits your printer;
    - models saved in the wrong unit.
  - **After slicing:** `POST /ai/v1/check/settings` takes a settings object, the G-code itself (read as it streams, up to 200 MB) or a sliced 3MF. It checks nozzle and bed temperatures for the filament, layer and first-layer heights for the nozzle, retraction, cooling, walls and infill, abrasive filament on a brass nozzle, and TPU speed. These are the same rules as the VERTEX slicer plugin.
  - **After printing:** `POST /ai/v1/diagnose/photo` is Print Doctor. Send a photo and it names the fault, boxes it on the photo and gives the settings that fix it.
  - `POST /ai/v1/outcomes` records how a print went, so the checks learn which fixes work.
  - `GET /ai/v1` and `GET /ai/v1/filaments` are open to everyone.
  - Live failure watch and "apply to my Recipe" are coming (they answer 501 for now).
- Your developer key works for Print AI, on your plan's allowance. Print AI has its own switch in Admin → Settings, plus a separate switch for photos. Staff keys work while it's off.
- **Docs:** a Print AI section covering every route, with examples and the findings format.

## 1.7.0 · 3 October 2026

### Changed
- **Smoother on big and ultra-wide monitors.** The front page does far less drawing per frame:
  - The 3D model turns at 30 frames a second, and is never drawn at more than about 1.6 million pixels.
  - The background's code text and glows are drawn once and reused, not redrawn every frame.
  - On very large screens the slow background drift redraws 20 times a second.
- **No stalls while a model builds.** The example models on the front page are built in the background, so the typing, scrolling and turning never pause while a model is made.

## 1.6.3 · 2 October 2026

### Fixed
- **The Skådis part (and other parts that load on demand) shows on the main screen again.** Picking it in "Try it" built nothing; now it loads the part's generator first and shows the model.

## 1.6.2 · 2 October 2026

### Fixed
- **Sharp moving text on big screens.** The drifting code in the background is drawn at full resolution again (it was drawn small and stretched, so it looked blurry on large monitors); the soft colour glow has its own small layer, so it stays fast. Headings and labels no longer sit on graphics-card layers that blurred them.
- **The background keeps moving.** On a busy computer it slows down a little instead of stopping for good.

## 1.6.1 · 2 October 2026

### Changed
- **Server racks** (`serverrack`): any height up to 42U with `height` (split into even sections that fit a 256 mm bed), `strength: "heavy"` for thicker rails, frames and splices, back X-braces (`braces`: `auto`, `true` or `false`), and fan panels for 80, 92, 120 and 140 mm PC fans.
- **Every animation on the graphics card, and nothing off screen does any work.** Moving parts (the floating model card, the blinking caret, the live lights, the drifting colour glow, the sliding tiles) run on transform and opacity only, on their own GPU layers; glows and pulses that used to animate shadows now fade a ready-made glow layer in and out; the background network is drawn at no more than 1.5× pixel density and stops completely when it's out of view. Feature cards, code blocks, the serial feed, the console and the pricing tiers hold still (no animation, no page updates) until you scroll them into view. Nothing was taken away.
- **The site keeps itself up to date while it's open.** Every minute it checks the engine and updates its version, the live light, the number of kinds, the pricing and the docs' kinds table in place, without a reload. When a new version of the site is out, a small note says so and the new version loads the next time you come back to the tab. The docs now list every kind by its own name.
- **Smooth on big monitors.** The site no longer lags on large, 4K or ultra-wide screens: the background is drawn at a sensible size and pauses once you scroll past the top, the glass panels no longer blur a moving background, the colour glow is drawn without a costly blur, and the page steps its effects down by itself on a computer that can't keep up. On a 3440 × 1440 screen it went from about 5 to over 30 frames a second in our test, with everything still there; phones were already smooth.
- **Ultra-wide screens:** the site, docs, console and admin use the width of 2560 and 3440 pixel monitors, with slightly larger text above 2800 pixels.

### Fixed
- The landing page said six model kinds; it now shows all 77, counted live from the engine.

## 1.6.0 · 2 October 2026

### Added
- **Tracer:** grey and silver tools a millimetre or two apart come back as separate outlines (they were merged), and a trace is about 10% faster with the same outlines.
- **Pill organisers** (`pillbox`): a week of compartments with day-marked lids.
- **Dated bag clips** (`dateclip`): a spring clip with a dial you turn to the day the packet was opened.
- **Fridge magnet holders** (`magnetholder`): pen cups, marker trays and note baskets with pockets for round magnets.
- **Jewellery stands** (`jewellerystand`): ring cones, earring holes and necklace notches on one stand.
- **Tie and belt racks** (`tierack`): hooks over the wardrobe rail, sized to the rail.
- **Coffee capsule holders** (`capsuleholder`): drawer trays for Nespresso, Dolce Gusto, K-Cup, Vertuo or custom capsules.
- **Door wedges and stops** (`doorstop`): a wedge sized to the gap under the door, and a wall stop.
- **Tube squeezers** (`tubesqueezer`): a slide-on squeezer and a winding key, sized to the tube.
- **Clothes pegs** (`clothespeg`): one-piece pegs with a printed spring, a plate at a time.
- **Paper towel holders** (`towelholder`): brackets and a rod for a kitchen roll, wall or under a cupboard.
- **Sink tidies** (`sinktidy`): a sponge and brush caddy on drain ribs, with a drip tray.
- **Faster builds**: parts made in layers build about 30% faster, with exactly the same files out.
- **Card holders** (`cardholder`): a curved block that fans a hand of cards.
- **Dice towers** (`dicetower`): two mirror halves with baffles and a tray.
- **Board game inserts** (`gameinsert`): card wells and token compartments.
- **Propagation stations** (`propagator`): a windowsill stand for cuttings in tubes.
- **Thread spool racks** (`spoolrack`): pegs with lips for thread and ribbon.
- **Bathroom caddies** (`bathcaddy`): a draining basket with optional shower-screen hooks.
- **Shoe horns and boot hooks** (`shoehorn`): a long horn and a wall plate with boot pegs.
- **Toy sorting trays** (`toytray`): stacking trays with a building-plate lid.
- **Hallway hooks** (`hallhooks`): umbrella and lead hooks with a poo-bag peg.
- **Cutlery drawer organisers** (`cutlerytray`): a drawer-filling tray split into bed-sized pieces.
- **Wine glass rails** (`glassrail`): T-slot rows under a shelf for glasses upside down.
- **Wrap and foil dispensers** (`wraprack`): two mirror door pieces for wrap, foil and paper boxes.
- **Under-shelf mug hooks** (`mughooks`): a slide-on shelf clip with hooks for mugs.
- **Pot lid racks** (`lidrack`): lids on their edges between scooped dividers.
- **Hair tool holders** (`hairholder`): a dryer ring, straightener sleeve, brush cup and cord hook on one plate.
- **Family charging stations** (`familycharger`): a named slot for every device over a hidden charger. Engine synced from VERTEX (slabs build a third faster, same meshes).
- `shoerack`: shoe and boot wall racks (a tilted shelf with a lip and a brace; a taller back for boots) and `petbowl`: raised pet bowl stands (sized to the bowls, a name on top, bolt-together modules when too wide for the bed) `routershelf`: router and modem wall shelves, `remotecaddy`: remote control caddies, `tabletholder`: wall tablet holders and `glassesrack`: glasses wall racks. `serverrack` gains fan panels (`fans`, `fanSize`, `fanCount`), cable panels (`cable`) and devices `switch8`, `flexmini` and `zima`. 50 model kinds. Engine 1.61.0.

## 1.5.0 · 2 October 2026

### Added
- `monitorriser`: monitor risers (a shelf, two legs and a back brace), `desktidy`: pen pots, business card stands and desk trays, `cablebox`: vented boxes that hide a power strip, `chargedock`: one stand for a phone, a watch and earbuds, `deskdrawer`: a drawer and two rails that screw under a desk, `deskhanger`: a headphone hook that screws under the desk edge, `controllerrack`: wall racks for game controllers and a headset, `grommet`: desk cable grommets, `serverrack`: modular 10-inch homelab racks (stackable boxes, shelves, drawers, patch panels, Pi and mini PC panels), `leadhanger`: extension lead and hose hangers, and `bikehook`: bike and helmet wall hooks. 44 model kinds. Engine 1.60.0.

### Improved
- **Tracing is faster and more accurate.**
  - Joining each tool into one whole outline is about five times quicker.
  - Tools lying a few millimetres apart come out separately.
  - Outlines sit within about a third of a millimetre of the real edge.
- **One big photo no longer slows down everyone else's calls.** Tracing now runs on its own background threads. A photo with no paper in it is still turned away before any outlining, so it costs nothing.
- **The status page says why.** Each part that isn't working in the admin's Status tab now shows the reason: the last checks failed, or which open incident it's under (its number, how bad it is, and its title).

## 1.4.0 · 1 October 2026

### Added
- Twenty-seven more generators through the API: `enclosure` (Pi and Arduino cases), `simrig` (sim rig parts), `tslot` (T-slot parts), `swatch` (filament swatches), `spool` (spool hubs, desiccant pods and dry-box feed-throughs), `knob` (knobs and drawer pulls), `dragchain` (cable drag chains), `hinge` (hinges and hinged boxes), `jar` (screw-top jars), `stand` (phone and tablet stands), `deskhook` (desk hooks), `planter` (plant pots and drip trays), `cutter` (cookie cutters, from a shape or a drawing), `keychain` (name keychains and tags), `bagclip` (bag clips), `coaster` (coasters), `cablewrap` (cable wraps and earbud winders), `battery` (battery trays with a lid, or Gridfinity battery bins), `shelfbracket` (shelf brackets), `headphone` (headphone stands), `keyrack` (key racks), `plantmarker` (plant markers), `toothbrush` (toothbrush holders), `spicerack` (spice racks), `broomholder` (broom and mop holders), `bookend` (bookends) and `laptopstand` (laptop stands). `GET /engine/v1/kinds` lists each one’s settings. Engine 1.58.0.

## 1.3.0 · 1 October 2026

- **A new developer console.** A sidebar for Overview, Keys, Calls, Webhooks and Plan and billing. Today's usage meter, totals with trends, a calls chart you can hover, what your keys made and in which formats, and a copy-ready first request. Keys are made, renamed, locked and revoked in proper dialogs, and ⌘K (Ctrl K) jumps anywhere.
- Calls can be filtered and opened for full details; webhook deliveries can be tested from the console.
- **Tool tracing finds more.** It now knows everyday things as well as tools (markers, pens, cables, batteries, tins, jars, sponges, boxes and more), adds anything that stands out from the paper even when it has no name for it, no longer outlines the sheet of paper itself, and finds the paper more reliably on a desk mat or a light table.
## 1.2.0 · 1 October 2026

- Fixed: pages could run a mix of old and new code after an update. Your browser now always checks for the current version.
- Fixed: the Education page showed an error in the background when you weren't signed in.
- Short links: staff can make links to post on MakerWorld, socials or flyers, and see how many people each one brings.
- The site counts its own visits (no cookies, nothing sent anywhere else) so we can see which pages help and where people come from. Your browser's "do not track" setting is respected.

## 1.1.2 · 1 October 2026

- Fixed: the homepage's 3D previews stopped with an error when a model had more than one part (a split baseplate, for example).
- The Free tier tile reads clearer: 1,000 calls a day for your whole account, and the figures follow the plan as it's set.

## 1.1.1 · 1 October 2026

- **Faster from overseas.** Pages ask for every script they need at once instead of a level at a time, and come back from your browser's cache on later visits (refreshed quietly in the background). With US-to-Australia lag, a repeat visit went from about 1.3 s to 0.3 s.
- Staff see an Admin link in the header when signed in.

## 1.1.0 · 1 October 2026

- **Education plan.** Schools, colleges and universities can apply with their details and proof (a signed letter on letterhead, or a notarised or certified statement). Every application is reviewed by hand; approved public schools get the plan at close to cost. Documents are deleted 30 days after the decision.
- The proper Mint Motive logo across the site, and a "Mint Motive" brand colour option.
- Better link previews and search listings (share images, structured data, sitemap). The status page can now be found in search.
- Footer menus fold open and shut; a calmer "Try it" button.

## 1.0.0 · 1 October 2026

- The Mint Motive API on its own site, api.mintmotive.com.au: the Engine API, the Tracer API, the developer portal, docs, console, status page and staff admin, all moved out of VERTEX.
- Sign in with your VERTEX account. Keys, call history, webhooks and plans come across from VERTEX.
- Staff admin gains a Settings tab: the engine and tracer switches, issuing tracer keys, the link to VERTEX, and payments.
