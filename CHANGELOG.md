# Changelog

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
