export const pathSealProfile = Object.freeze({
  id: "pathseal",
  productName: "Path Seal",
  productFamily: "SVG Micro Eco",
  campaignOperator: "Signal Drift",
  producer: "Skald and Kreepy Productions",
  audience: "People preparing SVG contours for CNC workflows who want to inspect questionable gaps before repair.",
  destination: "https://mytonite86-coder.github.io/svg-path-closer/pathseal.html",
  accessFact: "Path Seal founder access is currently offered at $9.99 per month; existing lifetime access remains unchanged.",
  campaignCredit: "Campaign operated by Signal Drift.",
  narrative: "Preserve the builder's intent by making questionable SVG closures visible and keeping repair choices in the user's hands.",
  angles: Object.freeze({
    preserve_intent: "Keep the original drawing intent visible while you review questionable gaps.",
    review_first: "See open contours and choose which paths should be sealed before repair.",
    cnc_preparation: "Prepare SVG contours for CNC work with a review-before-repair workflow."
  }),
  claims: Object.freeze({
    scans_open_paths: "Path Seal scans SVG files for open paths.",
    shows_questionable_gaps: "It shows questionable gaps for review.",
    user_approved_repairs: "You choose which paths Path Seal should close.",
    local_svg_processing: "The inspected SVG repair workflow processes SVG content locally in the browser."
  }),
  ctas: Object.freeze({
    try: "Try Path Seal",
    open: "Open Path Seal"
  }),
  forbiddenPhrases: Object.freeze([
    "repairs every", "fixes every", "all svg errors", "guaranteed", "fully automatic",
    "no review required", "outperforms", "better than every", "free forever"
  ])
});
