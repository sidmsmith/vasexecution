/** Real data from oLPN 0000099999100015448 / Order 6000012 (SS-DEMO), captured live. */
window.MOCK = {
  olpnId: "0000099999100015448",
  orderId: "6000012",
  requestorIds: ["-725117072", "-1003792703", "-1003792702"],

  /**
   * typeConfig[ProvidedServiceId].steps[stepId] is the REAL config/orgs/SS-DEMO.json
   * step entry (title/content/layout) verbatim, so mock-utils.js can hand it straight
   * to VasConfig.normalizeStepEntry + VasConfig.renderStepContentHtml — the same
   * renderer production uses. No formatting is reinvented for these mockups.
   */
  typeConfig: {
    "Verizon Laptop Prep": {
      icon: "https://res.cloudinary.com/com-manh-cp/image/upload/v1784262476/sidney/Lenovo_Yoga_9i_2_in_1_Aura_Edition_v01.png",
      // Illustrative only — capture sections are disabled on this type in the live
      // SS-DEMO config. Flipped on here so the mobile treatment can be reviewed.
      illustrativeSections: true,
      sections: {
        signature: { enabled: true, required: true, label: "Verizon Laptop Prep Signature" },
        photos: { enabled: true, required: false, label: "Verizon Laptop Prep Photos" },
        markupPad: { enabled: false, required: false, label: "Verizon Laptop Prep Markup", mode: "photo" }
      },
      steps: {
        "Asset Tag": {
          title: "Asset Tag",
          content: [
            {
              id: "ins_glju9tft",
              type: "text",
              text: "Attach Asset Tag",
              bold: false,
              italic: false,
              underline: false,
              color: "#000000",
              fontSize: 100,
              listMarker: "bullet"
            },
            {
              id: "ins_izy5dbwy",
              type: "text",
              text: "Log Tag in tracking system",
              bold: false,
              italic: false,
              underline: false,
              color: "#000000",
              fontSize: 100,
              listMarker: "bullet"
            }
          ],
          layout: { columns: [{ id: "col_0", width: 1, blockIds: ["ins_glju9tft", "ins_izy5dbwy"] }] }
        },
        "Flash BIOS": {
          title: "Flash BIOS",
          content: [
            {
              id: "ins_dgm3v72k",
              type: "text",
              text: "Set default passwords",
              bold: true,
              italic: false,
              underline: false,
              color: "#f90b0b",
              fontSize: 129,
              listMarker: "star"
            },
            {
              id: "ins_w95idiam",
              type: "text",
              text: "Configure boot sequence",
              bold: false,
              italic: false,
              underline: false,
              color: "#000000",
              fontSize: 100,
              listMarker: "bullet"
            },
            {
              id: "img_z0cnaddw",
              type: "image",
              url: "https://res.cloudinary.com/com-manh-cp/image/upload/v1784262476/sidney/Lenovo_ThinkPad_X1_Carbon_Gen_13_Aura_Edition_v01.png",
              caption: "",
              scale: 63
            },
            {
              id: "ins_1ln2jdve",
              type: "text",
              text: "Update Power Management",
              bold: false,
              italic: false,
              underline: false,
              color: "#000000",
              fontSize: 100,
              listMarker: "bullet"
            }
          ],
          layout: {
            columns: [
              { id: "col_0", width: 1, blockIds: ["ins_dgm3v72k", "ins_w95idiam"] },
              { id: "col_ota6b4vw", width: 1, blockIds: ["img_z0cnaddw"] },
              { id: "col_ai8w7m0k", width: 1, blockIds: ["ins_1ln2jdve"] }
            ]
          }
        }
      }
    },
    "Accessories Bundle": {
      icon: "https://res.cloudinary.com/com-manh-cp/image/upload/v1784254064/sidney/SHI_1.png",
      sections: {
        signature: { enabled: false, required: false, label: "Accessories Bundle Signature" },
        photos: { enabled: false, required: false, label: "Accessories Bundle Photos" },
        markupPad: { enabled: false, required: false, label: "Accessories Bundle Markup", mode: "photo" }
      },
      steps: {
        "Gather all accessories": {
          title: "Gather all accessories",
          content: [
            {
              id: "ins_khljcso9",
              type: "text",
              text: "Pick all accessories",
              bold: false,
              italic: false,
              underline: false,
              color: "#000000",
              fontSize: 100,
              listMarker: "bullet"
            },
            {
              id: "ins_ao9jzt33",
              type: "text",
              text: "Package all accessories into plastic bags",
              bold: false,
              italic: false,
              underline: false,
              color: "#000000",
              fontSize: 100,
              listMarker: "bullet"
            },
            {
              id: "img_mu2x95p5",
              type: "image",
              url: "https://res.cloudinary.com/com-manh-cp/image/upload/v1784254063/sidney/SHI_09.png",
              caption: "",
              scale: 48
            }
          ],
          layout: {
            columns: [
              { id: "col_0", width: 1, blockIds: ["ins_khljcso9", "ins_ao9jzt33"] },
              { id: "col_eznxg1tb", width: 1, blockIds: ["img_mu2x95p5"] }
            ]
          }
        },
        "Pack accessories": {
          title: "Pack accessories",
          content: [
            {
              id: "ins_8cs1r00f",
              type: "text",
              text: "Pack accessories bags into laptop bag",
              bold: false,
              italic: false,
              underline: false,
              color: "#000000",
              fontSize: 100,
              listMarker: "bullet"
            },
            {
              id: "img_k0exjvnk",
              type: "image",
              url: "https://res.cloudinary.com/com-manh-cp/image/upload/v1784254063/sidney/SHI_2.png",
              caption: "",
              scale: 10
            }
          ],
          layout: { columns: [{ id: "col_0", width: 1, blockIds: ["ins_8cs1r00f", "img_k0exjvnk"] }] }
        }
      }
    },

    // Two entirely synthetic types below (not real SS-DEMO config) — added purely to
    // stress-test scroll length, the swipe-between-Types gesture, and card density with
    // more than 2 Types / more than 2 steps in a single Type.
    "Gift Wrap Deluxe": {
      icon: "../../assets/icons/vas-type-gift-wrap.svg",
      sections: {},
      steps: {
        "Select wrap paper": {
          title: "Select wrap paper",
          content: [
            { id: "gwd_1", type: "text", text: "Choose wrap paper matching the order theme", bold: false, italic: false, underline: false, color: "#000000", fontSize: 100, listMarker: "bullet" },
            { id: "gwd_2", type: "text", text: "Verify the paper roll has enough remaining", bold: false, italic: false, underline: false, color: "#000000", fontSize: 100, listMarker: "bullet" }
          ],
          layout: { columns: [{ id: "col_0", width: 1, blockIds: ["gwd_1", "gwd_2"] }] }
        },
        "Wrap box": {
          title: "Wrap box",
          content: [
            { id: "gwd_3", type: "text", text: "Wrap the box securely on all sides", bold: false, italic: false, underline: false, color: "#000000", fontSize: 100, listMarker: "bullet" },
            { id: "gwd_4", type: "text", text: "Trim excess paper", bold: false, italic: false, underline: false, color: "#000000", fontSize: 100, listMarker: "bullet" }
          ],
          layout: { columns: [{ id: "col_0", width: 1, blockIds: ["gwd_3", "gwd_4"] }] }
        },
        "Add ribbon and bow": {
          title: "Add ribbon and bow",
          content: [
            { id: "gwd_5", type: "text", text: "Tie ribbon around the package", bold: false, italic: false, underline: false, color: "#000000", fontSize: 100, listMarker: "bullet" },
            { id: "gwd_6", type: "text", text: "Attach a bow at the center", bold: false, italic: false, underline: false, color: "#000000", fontSize: 100, listMarker: "bullet" }
          ],
          layout: { columns: [{ id: "col_0", width: 1, blockIds: ["gwd_5", "gwd_6"] }] }
        },
        "Attach gift tag": {
          title: "Attach gift tag",
          content: [
            { id: "gwd_7", type: "text", text: "Write the recipient name on the tag", bold: false, italic: false, underline: false, color: "#000000", fontSize: 100, listMarker: "bullet" },
            { id: "gwd_8", type: "text", text: "Attach the tag to the ribbon", bold: false, italic: false, underline: false, color: "#000000", fontSize: 100, listMarker: "bullet" }
          ],
          layout: { columns: [{ id: "col_0", width: 1, blockIds: ["gwd_7", "gwd_8"] }] }
        },
        "Apply UPC label": {
          title: "Apply UPC label",
          content: [
            { id: "gwd_9", type: "text", text: "Confirm UPC matches the item", bold: true, italic: false, underline: false, color: "#f90b0b", fontSize: 115, listMarker: "star" },
            { id: "gwd_10", type: "text", text: "Apply label to the bottom of the package", bold: false, italic: false, underline: false, color: "#000000", fontSize: 100, listMarker: "bullet" }
          ],
          layout: { columns: [{ id: "col_0", width: 1, blockIds: ["gwd_9", "gwd_10"] }] }
        }
      }
    },
    "Print Price Ticket": {
      icon: "../../assets/icons/vas-type-print-price-ticket.svg",
      sections: {},
      steps: {
        "Print ticket": {
          title: "Print ticket",
          content: [
            { id: "ppt_1", type: "text", text: "Print price ticket from the label printer", bold: false, italic: false, underline: false, color: "#000000", fontSize: 100, listMarker: "bullet" }
          ],
          layout: { columns: [{ id: "col_0", width: 1, blockIds: ["ppt_1"] }] }
        },
        "Attach ticket to item": {
          title: "Attach ticket to item",
          content: [
            { id: "ppt_2", type: "text", text: "Attach ticket securely to the item tag", bold: false, italic: false, underline: false, color: "#000000", fontSize: 100, listMarker: "bullet" }
          ],
          layout: { columns: [{ id: "col_0", width: 1, blockIds: ["ppt_2"] }] }
        }
      }
    }
  },

  services: [
    {
      idx: 1,
      ProvidedServiceId: "Verizon Laptop Prep",
      ServiceRequestorId: "-725117072",
      ServiceRequestorTypeId: "Olpn",
      ServiceUomId: "oLPN",
      IsOlpnLevel: true,
      ItemId: null,
      Status: "Created",
      steps: [
        { id: "Asset Tag", desc: "Asset Tag", req: 1, rem: 1, comp: 0 },
        // req 2 (not real SS-DEMO data) so the qty > 1 stepper/complete workflow is testable.
        { id: "Flash BIOS", desc: "Flash BIOS", req: 2, rem: 2, comp: 0 }
      ]
    },
    {
      idx: 2,
      ProvidedServiceId: "Accessories Bundle",
      ServiceRequestorId: "-1003792703",
      ServiceRequestorTypeId: "Olpn",
      ServiceUomId: "oLPN",
      IsOlpnLevel: true,
      ItemId: null,
      Status: "Created",
      steps: [
        { id: "Gather all accessories", desc: "Gather all accessories", req: 1, rem: 1, comp: 0 },
        // req 2 (not real SS-DEMO data) so the qty > 1 stepper/complete workflow is testable.
        { id: "Pack accessories", desc: "Pack accessories", req: 2, rem: 2, comp: 0 }
      ]
    },
    // Synthetic — see typeConfig note above.
    {
      idx: 3,
      ProvidedServiceId: "Gift Wrap Deluxe",
      ServiceRequestorId: "-900000001",
      ServiceRequestorTypeId: "Olpn",
      ServiceUomId: "oLPN",
      IsOlpnLevel: true,
      ItemId: null,
      Status: "Created",
      steps: [
        { id: "Select wrap paper", desc: "Select wrap paper", req: 1, rem: 1, comp: 0 },
        { id: "Wrap box", desc: "Wrap box", req: 1, rem: 1, comp: 0 },
        { id: "Add ribbon and bow", desc: "Add ribbon and bow", req: 1, rem: 1, comp: 0 },
        { id: "Attach gift tag", desc: "Attach gift tag", req: 1, rem: 1, comp: 0 },
        { id: "Apply UPC label", desc: "Apply UPC label", req: 1, rem: 1, comp: 0 }
      ]
    },
    {
      idx: 4,
      ProvidedServiceId: "Print Price Ticket",
      ServiceRequestorId: "-900000002",
      ServiceRequestorTypeId: "Olpn",
      ServiceUomId: "oLPN",
      IsOlpnLevel: true,
      ItemId: null,
      Status: "Created",
      steps: [
        { id: "Print ticket", desc: "Print ticket", req: 1, rem: 1, comp: 0 },
        { id: "Attach ticket to item", desc: "Attach ticket to item", req: 1, rem: 1, comp: 0 }
      ]
    }
  ]
};
