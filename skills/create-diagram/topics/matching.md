# Matching an existing diagram

When a diagram exists somewhere and this one should look like it, read its
source if you have it, not a screenshot.

- **Carry its numbers, scaled.** Put its coordinates and sizes through one
  factor (`const S = ourPanelWidth / theirPanelWidth`) and a helper that maps
  its x into ours, rather than re-laying it out by eye. Hand-placed, unevenly
  spaced positions are not reproduced by nudging an even layout.
- **The vertical may not scale with the horizontal.** If the canvas keeps a
  different aspect, scale what reads as proportion and hand-fit the rest.
- **A reference is not automatically right.** Check contrast on anything you
  copy, and keep a departure only with its reason written in the scene.
