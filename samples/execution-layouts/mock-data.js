/** Static data from oLPN 0000099999100015233 + SS-DEMO step content split (mock). */
window.MOCK = {
  olpnId: "0000099999100015233",
  orderId: "6000012",
  requestorIds: ["-725177770", "-1005674341", "-1005674340"],
  typeConfig: {
    "Gift Wrap": {
      icon: "/assets/icons/vas-type-gift-wrap.svg",
      shared: "Use approved wrap paper and ribbon for the brand.",
      steps: {
        Wrap: [
          "Measure the box",
          "Cut the paper",
          "Cover the package"
        ],
        "Tie Bow": [
          "Tie the bow neatly",
          "Use the holiday bows",
          "Ensure ribbon is snug and ends are trimmed neatly."
        ]
      }
    },
    "Dicks VAS Activities": {
      icon: "/assets/icons/vas-type-dicks-vas-activities.svg",
      shared: "Complete all Dicks Sporting Goods ticket and label steps.",
      steps: {
        "Print Dicks Price Tickets": [
          "Print Price Ticket",
          "Apply UPC Tag",
          "Print Dicks Price Tickets"
        ],
        "Apply Labels": [
          "Print and attach label",
          "Apply Labels"
        ]
      }
    }
  },
  services: [
    {
      idx: 1,
      ProvidedServiceId: "Dicks VAS Activities",
      ServiceRequestorId: "-725177770",
      ServiceRequestorTypeId: "Olpn",
      ServiceUomId: "oLPN",
      IsOlpnLevel: true,
      ItemId: null,
      Status: "Created",
      steps: [
        {
          id: "Print Dicks Price Tickets",
          desc: "Print Dicks Price Tickets",
          req: 1,
          rem: 1,
          comp: 0
        },
        { id: "Apply Labels", desc: "Apply Labels", req: 1, rem: 1, comp: 0 }
      ]
    },
    {
      idx: 2,
      ProvidedServiceId: "Gift Wrap",
      ServiceRequestorId: "-725177770",
      ServiceRequestorTypeId: "Olpn",
      ServiceUomId: "oLPN",
      IsOlpnLevel: true,
      ItemId: null,
      Status: "Created",
      steps: [
        { id: "Wrap", desc: "Wrap", req: 1, rem: 1, comp: 0 },
        { id: "Tie Bow", desc: "Tie the bow", req: 1, rem: 1, comp: 0 }
      ]
    },
    {
      idx: 3,
      ProvidedServiceId: "Gift Wrap",
      ServiceRequestorId: "-1005674340",
      ServiceRequestorTypeId: "OlpnDetail",
      ServiceUomId: "ITEM",
      IsOlpnLevel: false,
      ItemId: "4000041",
      ItemDescription: "Demo item",
      Status: "Created",
      steps: [
        { id: "Wrap", desc: "Wrap", req: 3, rem: 3, comp: 0 },
        { id: "Tie Bow", desc: "Tie the bow", req: 3, rem: 3, comp: 0 }
      ]
    }
  ]
};
