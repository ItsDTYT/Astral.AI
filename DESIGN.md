# Interface notes

Characters and readable conversations are the focus. The application keeps model setup and advanced controls separate from the chat screen. Utility screens use direct headings and short explanations.

Theme colors resolve through astral/shared/appearance.js. Use semantic tokens for surfaces, borders, text, focus, controls, and status. Custom colors must reach dialogs, navigation, loading states, and effects. Preset swatches and character artwork keep their own colors.

Forms share 44px controls, 24px panel padding, and 16px padding in compact layouts. Text fields, switches, sliders, color pickers, and file pickers have separate styles. Hidden controls stay hidden. Labels wrap and controls fit their container; smaller windows scroll instead of clipping actions.

Use DM Sans for the interface and Outfit for the product name and utility headings. Respect the saved UI scale and density. The visual-novel scene uses separate portraits and scenery, with reduced-motion and effects-off fallbacks.

Taste and UI/UX Pro Max informed the design. AI tools assisted with implementation and visual elements; see Credits and astral/ARTWORK.md for provenance.
