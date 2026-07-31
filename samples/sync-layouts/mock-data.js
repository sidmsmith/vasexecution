/**
 * Static mock data for VAS WMS Sync layout samples.
 * Shape mirrors the real /api/vas_sync_diff response (types[].steps[]) plus
 * the client-side `notYetDeployed` flag computed in js/vas-config-sync.js.
 * Chosen to cover every gap combination the real diff can produce:
 *   - push-only gap (config has extra text WMS doesn't)
 *   - pull-only gap (WMS has extra text config doesn't)
 *   - reordered-but-identical text (correctly NOT a gap)
 *   - whole type missing in WMS / missing in config
 *   - fully aligned
 *   - local draft not yet deployed (independent of WMS diff state)
 *   - local draft not yet deployed AND has a real gap (a step deleted in
 *     Admin but not yet Saved & Deployed — see "Verizon Desktop Prep")
 */
window.SYNC_MOCK = {
  wmsCount: 8,
  types: [
    {
      id: "Verizon Laptop Prep",
      title: "Verizon Laptop Prep",
      wmsDescription: "Verizon Laptop Prep",
      status: "aligned",
      instructionStatus: "instructions_differ",
      notYetDeployed: false,
      warnings: [],
      steps: [
        {
          id: "Asset Tag",
          status: "aligned",
          instructionStatus: "instructions_differ",
          configInstructions: ["Attach Asset Tag", "Log Tag in tracking system"],
          wmsInstructions: [
            "Attach Asset Tag",
            "Log Tag in tracking system",
            "Apply labels - test"
          ]
        },
        {
          id: "Flash BIOS",
          status: "aligned",
          instructionStatus: "instructions_aligned",
          configInstructions: ["Flash BIOS to latest version", "Verify boot screen"],
          wmsInstructions: ["Flash BIOS to latest version", "Verify boot screen"]
        }
      ]
    },
    {
      id: "Dicks VAS Activities",
      title: "Dicks VAS Activities",
      wmsDescription: "VAS Activities required for Dicks Sporting Goods",
      status: "aligned",
      instructionStatus: "instructions_differ",
      notYetDeployed: false,
      warnings: [],
      steps: [
        {
          id: "Apply Labels",
          status: "aligned",
          instructionStatus: "instructions_aligned",
          configInstructions: ["Print and attach label"],
          wmsInstructions: ["Print and attach label"]
        },
        {
          id: "Print Dicks Price Tickets",
          status: "aligned",
          instructionStatus: "instructions_differ",
          configInstructions: [
            "Print Price Ticket",
            "Apply UPC Tag",
            "Complete all Dicks Sporting Goods ticket and label steps."
          ],
          wmsInstructions: ["Print Price Ticket", "Apply UPC Tag"]
        }
      ]
    },
    {
      id: "Gift Wrap",
      title: "Gift Wrap",
      wmsDescription: "Gift Wrap",
      status: "aligned",
      instructionStatus: "instructions_differ",
      notYetDeployed: false,
      warnings: [],
      steps: [
        {
          id: "Tie Bow",
          status: "aligned",
          instructionStatus: "instructions_differ",
          configInstructions: ["Tie the bow neatly", "Use the holiday bows"],
          wmsInstructions: ["Use the holiday bows", "Tie the bow neatly"]
        },
        {
          id: "Wrap",
          status: "aligned",
          instructionStatus: "instructions_aligned",
          configInstructions: ["Wrap with holiday paper", "Tape all seams"],
          wmsInstructions: ["Wrap with holiday paper", "Tape all seams"]
        }
      ]
    },
    {
      id: "New Store Prep",
      title: "New Store Prep",
      wmsDescription: null,
      status: "missing_in_wms",
      instructionStatus: null,
      notYetDeployed: false,
      warnings: [],
      steps: [
        {
          id: "Verify Labels",
          status: "missing_in_wms",
          instructionStatus: "instructions_missing_in_wms",
          configInstructions: ["Verify all labels are legible", "Check barcode scans"],
          wmsInstructions: []
        },
        {
          id: "Photograph Unit",
          status: "missing_in_wms",
          instructionStatus: "instructions_missing_in_wms",
          configInstructions: ["Take 4 photos: front, back, left, right"],
          wmsInstructions: []
        }
      ]
    },
    {
      id: "Legacy Repack",
      title: "Legacy Repack",
      wmsDescription: "Legacy Repack (pre-2024 process)",
      status: "missing_in_config",
      instructionStatus: null,
      notYetDeployed: false,
      warnings: [],
      steps: [
        {
          id: "Repack Legacy",
          status: "missing_in_config",
          instructionStatus: "instructions_missing_in_config",
          configInstructions: [],
          wmsInstructions: ["Repack into legacy carton", "Apply legacy carrier label"]
        }
      ]
    },
    {
      id: "Engraving",
      title: "Engraving",
      wmsDescription: "Engraving",
      status: "aligned",
      instructionStatus: "instructions_aligned",
      notYetDeployed: false,
      warnings: [],
      steps: [
        {
          id: "Engrave with appropriate letter",
          status: "aligned",
          instructionStatus: "instructions_aligned",
          configInstructions: ["Engrave with appropriate letter", "Gift Pack in blue box"],
          wmsInstructions: ["Engrave with appropriate letter", "Gift Pack in blue box"]
        }
      ]
    },
    {
      // Recreates the original "delete RKs Step in Admin, don't Save &
      // Deploy yet" scenario, PLUS a second, finer-grained edit in the same
      // session — added one new instruction line to Asset Tag, also unsaved
      // and not yet in WMS either. Demonstrates both granularities the Sync
      // page needs to surface: stepNotDeployed marks a whole step that was
      // added/removed locally (RKs Step — present in deployed+WMS, absent
      // from draft); deployedInstructions marks individual lines that exist
      // in the draft but not in what's actually deployed (Asset Tag's new
      // "Confirm serial number" line). Both are independent of the
      // draft-vs-WMS comparison — RKs Step happens to also be a real
      // Missing in config gap; the new Asset Tag line happens to also be a
      // real Missing in WMS gap, since neither has reached WMS yet either.
      id: "Verizon Desktop Prep",
      title: "Verizon Desktop Prep",
      wmsDescription: "Verizon Desktop Prep",
      status: "aligned",
      instructionStatus: "instructions_differ",
      notYetDeployed: true,
      warnings: [],
      steps: [
        {
          id: "Asset Tag",
          status: "aligned",
          instructionStatus: "instructions_differ",
          configInstructions: ["Attach Asset Tag", "Confirm serial number"],
          deployedInstructions: ["Attach Asset Tag"],
          wmsInstructions: ["Attach Asset Tag"]
        },
        {
          id: "RKs Step",
          status: "missing_in_config",
          instructionStatus: "instructions_missing_in_config",
          stepNotDeployed: true,
          configInstructions: [],
          wmsInstructions: ["Complete RKs check", "Log RKs result"]
        }
      ]
    },
    {
      id: "Apply UPC Tags",
      title: "Apply UPC Tags",
      wmsDescription: "Apply UPC Tags",
      status: "aligned",
      instructionStatus: "instructions_aligned",
      notYetDeployed: true,
      warnings: [
        { code: "id_whitespace", field: "ProvidedServiceStepId", raw: "Create UPC Tag " }
      ],
      steps: [
        {
          id: "Create UPC Tag",
          status: "aligned",
          instructionStatus: "instructions_aligned",
          configInstructions: ["Create UPC Tag for the item", "Apply the UPC Tag once it has been printed"],
          wmsInstructions: ["Create UPC Tag for the item", "Apply the UPC Tag once it has been printed"]
        }
      ]
    }
  ]
};
