/* Original Olympus talent comparison. Exact source text is evidence; it is not a combat simulator. */
(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.OlympusTalentAnalysis = api;
})(typeof window === "object" ? window : globalThis, function () {
  "use strict";
  const SOURCE = Object.freeze({ revision: "260cf99b52db", rawSHA256: "260cf99b52db5fd0085043d4d3c2d5dde1b47dffe88b9696c94caccc9fb03588", normalizedSHA256: "8b174d764836675b2b759050f441e2dfe12c7bad6a5b279ef39b05d8b1288a0c", clientBuild: "1.60.1.70425", name: "Talents Forever", url: "https://talentsforever.com", license: "CC BY 4.0" });
  const CLASS_IDS = ["warrior", "paladin", "hunter", "rogue", "priest", "shaman", "mage", "warlock", "druid"];
  // Filled from exact reviewed rank strings. Values are manually scoped component modifiers, never final character totals.
  const MAPPINGS = {
  "warrior-arms-deflection": {
    "texts": [
      "Increases your Parry chance by 1%.",
      "Increases your Parry chance by 2%.",
      "Increases your Parry chance by 3%.",
      "Increases your Parry chance by 4%.",
      "Increases your Parry chance by 5%."
    ],
    "hashes": [
      "81df161de1b7e5aaca1ac11d97bc099fc1166461bd85ba75036fc4689f5d40ee",
      "07240a9050b69ff662ae715041249afdc098187db2b88b2a1c77e145149669af",
      "376cc6c3c0708e15573aff6723ed4cd51f43af790339e81df57a2afc4f06b345",
      "2652a07379cbf69de107bbb3dd4b55eb0e44559b5b6cac2a3a119b3f131ae526",
      "50b19d1f898a35f1a8b9cac6f67af85c12418d74c68d20a38d2dd02119683e4f"
    ],
    "components": [
      {
        "metric": "parry-chance",
        "label": "Parry chance modifier",
        "values": [
          1,
          2,
          3,
          4,
          5
        ],
        "unit": "percentage_points",
        "scope": "Player parry chance",
        "condition": "Only when the game permits parrying; weapon/ability requirements and final chance are not resolved."
      }
    ],
    "note": "Each listed component follows the pinned rank text. Conditional behavior, interactions and final character totals are not simulated."
  },
  "warrior-fury-cruelty": {
    "texts": [
      "Improves your chance to get a critical strike with melee attacks by 1%.",
      "Improves your chance to get a critical strike with melee attacks by 2%.",
      "Improves your chance to get a critical strike with melee attacks by 3%.",
      "Improves your chance to get a critical strike with melee attacks by 4%.",
      "Improves your chance to get a critical strike with melee attacks by 5%."
    ],
    "hashes": [
      "2bd41714a5e7a886e19f61572ac09f46c9bed77b0e8669a021bcf0137c4149b8",
      "2e7507eafb433e5c978ea8ef62920bffa808d4cf77f1f075b868065694dcc0e7",
      "f7fd580bb2eada568f50bb72bae28282e6332a83eca87282ed36350735ac5935",
      "b87c3ba2a664c8f615c6259a3a72c6c61394286dab803ad26c9e2de6934ec40a",
      "323c60e258ad6825cb51653168bd1e1468e7337bbb6e3acd77ba1105b49b718d"
    ],
    "components": [
      {
        "metric": "melee-critical-chance",
        "label": "Melee critical chance modifier",
        "values": [
          1,
          2,
          3,
          4,
          5
        ],
        "unit": "percentage_points",
        "scope": "Melee attacks",
        "condition": "Described talent modifier only; no final character chance is computed."
      }
    ],
    "note": "Each listed component follows the pinned rank text. Conditional behavior, interactions and final character totals are not simulated."
  },
  "warrior-protection-anticipation": {
    "texts": [
      "Increases your Defense Skill by 4.",
      "Increases your Defense Skill by 8.",
      "Increases your Defense Skill by 12.",
      "Increases your Defense Skill by 16.",
      "Increases your Defense Skill by 20."
    ],
    "hashes": [
      "233841016400085dd901a4fe972feafc443d438746d0136f4cfe0d2841d0cd1e",
      "a9eb12231e75903f53f364ccedf5347ff0afa85f2336bff976fa302824659aba",
      "397e57fa76cb7a41a069c07683c5377cf1d174c51d9e58dea24be4fd2d9a9cd7",
      "ab242e4e9a1246795c33bd21f611b1587ada738a4b2f865300341dc19f254e02",
      "be378dee331fa0c27d2d431eaed1a64fa1818a2826ea19e98a56d23be03a9410"
    ],
    "components": [
      {
        "metric": "defense-skill",
        "label": "Defense skill modifier",
        "values": [
          4,
          8,
          12,
          16,
          20
        ],
        "unit": "skill",
        "scope": "Player defense skill",
        "condition": "Actual trained defense and derived avoidance are unavailable."
      }
    ],
    "note": "Each listed component follows the pinned rank text. Conditional behavior, interactions and final character totals are not simulated."
  },
  "paladin-holy-divine-strength": {
    "texts": [
      "Increases your Strength by 2%.",
      "Increases your Strength by 4%.",
      "Increases your Strength by 6%.",
      "Increases your Strength by 8%.",
      "Increases your Strength by 10%."
    ],
    "hashes": [
      "b1a0689df1ef5f99f75e68a29ebfca12768456eae140157d472f7d7f224c0f11",
      "794230d450f6733a261f111dfd8d4b624b1e179144773dbee20d45ed71c8b90c",
      "98eb26b2f42b40e56f6c1d3d4763624e4edaa6f207715ac410f66eecdfa34165",
      "5622de0e3b6b74994294271076b25cef5ec16347cb1167a8b1d221fdf1c22928",
      "836d4e0cb39fba2a957aaab6f842c8b51032805be4be5a0f42c1c696a6ca6d5b"
    ],
    "components": [
      {
        "metric": "strength",
        "label": "Strength modifier",
        "values": [
          2,
          4,
          6,
          8,
          10
        ],
        "unit": "percent",
        "scope": "Player Strength",
        "condition": "Described talent modifier only; stacking and final base-stat totals are not computed."
      }
    ],
    "note": "Each listed component follows the pinned rank text. Conditional behavior, interactions and final character totals are not simulated."
  },
  "paladin-holy-divine-intellect": {
    "texts": [
      "Increases your total Intellect by 2%.",
      "Increases your total Intellect by 4%.",
      "Increases your total Intellect by 6%.",
      "Increases your total Intellect by 8%.",
      "Increases your total Intellect by 10%."
    ],
    "hashes": [
      "dec34c3a63be093b9ff03211938706308d982f74e6c2d014349194f95d53aa76",
      "e3cdddaaaceaf737b7ec5177e06baa94dff51f44f25d1c50e496a2afaa4ed150",
      "d36b243cad77ce50e676c54de5784dbf6b088a91f82bb81ad3ac2e475f32022f",
      "069cd08fe4d509cd7d0e25dabdff0d6aefd74f8b85e6e0c3a4e1a42ae16d1c09",
      "49c39802ba72cc4203d081607fe838f8f9820bbb5db7b0d41cda4ec260225679"
    ],
    "components": [
      {
        "metric": "intellect",
        "label": "Intellect modifier",
        "values": [
          2,
          4,
          6,
          8,
          10
        ],
        "unit": "percent",
        "scope": "Player total Intellect",
        "condition": "Described talent modifier only; stacking and final base-stat totals are not computed."
      }
    ],
    "note": "Each listed component follows the pinned rank text. Conditional behavior, interactions and final character totals are not simulated."
  },
  "paladin-protection-toughness": {
    "texts": [
      "Increases your armor value from items by 2%.",
      "Increases your armor value from items by 4%.",
      "Increases your armor value from items by 6%.",
      "Increases your armor value from items by 8%.",
      "Increases your armor value from items by 10%."
    ],
    "hashes": [
      "9a3bfea0a39f7034955d3a6b5712292c8fed17a573b71038291484ca26f28b7a",
      "4dae3cbad78c41e0d50f3b93c6434c15e6d4b5d9b23357b73324b231437077b1",
      "ed96a531fa4abb081b47f888887c0588e2905fce31c73f8aeb2940b201c57965",
      "a76726826fad41b6f76a926430c775935159da5696ed295e76955779da37bcbb",
      "e62c6a588558dbacddff38bc477b6b919f82150efb373cf1b8dcafed9e5d386f"
    ],
    "components": [
      {
        "metric": "item-armor",
        "label": "Item armor modifier",
        "values": [
          2,
          4,
          6,
          8,
          10
        ],
        "unit": "percent",
        "scope": "Armor from items only",
        "condition": "Requires item armor; does not imply an increase to base armor or an unequipped character total."
      }
    ],
    "note": "Each listed component follows the pinned rank text. Conditional behavior, interactions and final character totals are not simulated."
  },
  "paladin-protection-anticipation": {
    "texts": [
      "Increases your Defense Skill by 4.",
      "Increases your Defense Skill by 8.",
      "Increases your Defense Skill by 12.",
      "Increases your Defense Skill by 16.",
      "Increases your Defense Skill by 20."
    ],
    "hashes": [
      "233841016400085dd901a4fe972feafc443d438746d0136f4cfe0d2841d0cd1e",
      "a9eb12231e75903f53f364ccedf5347ff0afa85f2336bff976fa302824659aba",
      "397e57fa76cb7a41a069c07683c5377cf1d174c51d9e58dea24be4fd2d9a9cd7",
      "ab242e4e9a1246795c33bd21f611b1587ada738a4b2f865300341dc19f254e02",
      "be378dee331fa0c27d2d431eaed1a64fa1818a2826ea19e98a56d23be03a9410"
    ],
    "components": [
      {
        "metric": "defense-skill",
        "label": "Defense skill modifier",
        "values": [
          4,
          8,
          12,
          16,
          20
        ],
        "unit": "skill",
        "scope": "Player defense skill",
        "condition": "Actual trained defense and derived avoidance are unavailable."
      }
    ],
    "note": "Each listed component follows the pinned rank text. Conditional behavior, interactions and final character totals are not simulated."
  },
  "paladin-retribution-deflection": {
    "texts": [
      "Increases your Parry chance by 1%.",
      "Increases your Parry chance by 2%.",
      "Increases your Parry chance by 3%.",
      "Increases your Parry chance by 4%.",
      "Increases your Parry chance by 5%."
    ],
    "hashes": [
      "81df161de1b7e5aaca1ac11d97bc099fc1166461bd85ba75036fc4689f5d40ee",
      "07240a9050b69ff662ae715041249afdc098187db2b88b2a1c77e145149669af",
      "376cc6c3c0708e15573aff6723ed4cd51f43af790339e81df57a2afc4f06b345",
      "2652a07379cbf69de107bbb3dd4b55eb0e44559b5b6cac2a3a119b3f131ae526",
      "50b19d1f898a35f1a8b9cac6f67af85c12418d74c68d20a38d2dd02119683e4f"
    ],
    "components": [
      {
        "metric": "parry-chance",
        "label": "Parry chance modifier",
        "values": [
          1,
          2,
          3,
          4,
          5
        ],
        "unit": "percentage_points",
        "scope": "Player parry chance",
        "condition": "Only when the game permits parrying; weapon/ability requirements and final chance are not resolved."
      }
    ],
    "note": "Each listed component follows the pinned rank text. Conditional behavior, interactions and final character totals are not simulated."
  },
  "hunter-marksmanship-lethal-attacks": {
    "texts": [
      "Increases your critical strike chance with all attacks by 1%.",
      "Increases your critical strike chance with all attacks by 2%.",
      "Increases your critical strike chance with all attacks by 3%.",
      "Increases your critical strike chance with all attacks by 4%.",
      "Increases your critical strike chance with all attacks by 5%."
    ],
    "hashes": [
      "e00a73d1fdc34214d07e26d068e22647190619d60261f3875a581f35fe30caa3",
      "3c81da1c0e9645434273c401452e6661cd5cae6272f3c78e4eff03eca7d2a1cb",
      "fcc331900a641a139e58a4bb0c2442fb4068c6c9e67145a8ad860ec143bfe762",
      "5268542b4c358050b838f30f67a94d3a0128fbcf3b45c7cc390df5c84499e7ea",
      "1d1dca5264efb6131a4f2121f7e42b3b931aed5efc8ccf2f1c37cbea147f96fa"
    ],
    "components": [
      {
        "metric": "attack-critical-chance",
        "label": "Attack critical chance modifier",
        "values": [
          1,
          2,
          3,
          4,
          5
        ],
        "unit": "percentage_points",
        "scope": "All attacks",
        "condition": "Described talent modifier only; no final character chance is computed."
      }
    ],
    "note": "Each listed component follows the pinned rank text. Conditional behavior, interactions and final character totals are not simulated."
  },
  "hunter-survival-deflection": {
    "texts": [
      "Increases your Parry chance by 1%.",
      "Increases your Parry chance by 2%.",
      "Increases your Parry chance by 3%.",
      "Increases your Parry chance by 4%.",
      "Increases your Parry chance by 5%."
    ],
    "hashes": [
      "81df161de1b7e5aaca1ac11d97bc099fc1166461bd85ba75036fc4689f5d40ee",
      "07240a9050b69ff662ae715041249afdc098187db2b88b2a1c77e145149669af",
      "376cc6c3c0708e15573aff6723ed4cd51f43af790339e81df57a2afc4f06b345",
      "2652a07379cbf69de107bbb3dd4b55eb0e44559b5b6cac2a3a119b3f131ae526",
      "50b19d1f898a35f1a8b9cac6f67af85c12418d74c68d20a38d2dd02119683e4f"
    ],
    "components": [
      {
        "metric": "parry-chance",
        "label": "Parry chance modifier",
        "values": [
          1,
          2,
          3,
          4,
          5
        ],
        "unit": "percentage_points",
        "scope": "Player parry chance",
        "condition": "Only when the game permits parrying; weapon/ability requirements and final chance are not resolved."
      }
    ],
    "note": "Each listed component follows the pinned rank text. Conditional behavior, interactions and final character totals are not simulated."
  },
  "hunter-survival-survivalist": {
    "texts": [
      "Increases your total Health by 2%.",
      "Increases your total Health by 4%.",
      "Increases your total Health by 6%.",
      "Increases your total Health by 8%.",
      "Increases your total Health by 10%."
    ],
    "hashes": [
      "1cdc6794104e920757637464d6f5d5d4bfb14887d576e75b34f88570a29388fa",
      "b35f46bd73b4262b2142207c880dc0cadf5fc18e4d574c4e92e8a8631a64fe38",
      "045064f5285035209a38fe079419122582cbce762588f8d57da8b071581c3a86",
      "5e5bdcab6219d31e27d6fee58fd1c891850f09cd8185162cf1d4fa63d4cc2d58",
      "ff02ac5840363be957bd4dcb990f306d6acb9d7852431dfb21933f982ebc8ac8"
    ],
    "components": [
      {
        "metric": "total-health",
        "label": "Total Health modifier",
        "values": [
          2,
          4,
          6,
          8,
          10
        ],
        "unit": "percent",
        "scope": "Player total Health",
        "condition": "Described talent modifier only; stacking and final base-stat totals are not computed."
      }
    ],
    "note": "Each listed component follows the pinned rank text. Conditional behavior, interactions and final character totals are not simulated."
  },
  "hunter-survival-lightning-reflexes": {
    "texts": [
      "Increases your Agility by 2%.",
      "Increases your Agility by 4%.",
      "Increases your Agility by 6%.",
      "Increases your Agility by 8%.",
      "Increases your Agility by 10%."
    ],
    "hashes": [
      "026f7576f656b970229ad431065e5450ec58fabe148e6d57d2bf4d308f7b7208",
      "b8da1d0b98d304281ccc8518c00ba2f1dd5956533afab175eac558b14160fd12",
      "bab7e98637677a50ba363cee63a3058860ba792fce5203a59f1532630fd0ef47",
      "56a2f09d9bba87551d30db2de13b295f4fa5fc9883f43e12a3e13efa5c54ef49",
      "381a14a65c81c94e741479966164fd5c3d361ea9cb06729ede5a3a93fee59950"
    ],
    "components": [
      {
        "metric": "agility",
        "label": "Agility modifier",
        "values": [
          2,
          4,
          6,
          8,
          10
        ],
        "unit": "percent",
        "scope": "Player Agility",
        "condition": "Described talent modifier only; stacking and final base-stat totals are not computed."
      }
    ],
    "note": "Each listed component follows the pinned rank text. Conditional behavior, interactions and final character totals are not simulated."
  },
  "rogue-assassination-malice": {
    "texts": [
      "Increases your critical strike chance with all attacks and Poisons by 1%.",
      "Increases your critical strike chance with all attacks and Poisons by 2%.",
      "Increases your critical strike chance with all attacks and Poisons by 3%.",
      "Increases your critical strike chance with all attacks and Poisons by 4%.",
      "Increases your critical strike chance with all attacks and Poisons by 5%."
    ],
    "hashes": [
      "d7cb9198e0ea6c1c1944b7c71ac91d27f63551292b2d2dfc699833ed854b524a",
      "0a4e278a234121c3e3ecbb21e3c891daa98dc4c1c707f59c0ceb354f9bdf207f",
      "d3fded3c47de19be4514a0b02e7fc98188f77dc3ca92477483b0caf33dcfeea7",
      "5c7b1b7443bbc0a5551cd73dd1af72c1abf15600e295d93bf2bf8ca1924db64c",
      "159bf51da981762d0eccc0e0b4448136b5c3b095aeeb7c67b98c51f7d5aaad7e"
    ],
    "components": [
      {
        "metric": "attacks-and-poisons-critical-chance",
        "label": "Attack and Poison critical chance modifier",
        "values": [
          1,
          2,
          3,
          4,
          5
        ],
        "unit": "percentage_points",
        "scope": "All attacks and Poisons",
        "condition": "Described talent modifier only; no final character chance is computed."
      }
    ],
    "note": "Each listed component follows the pinned rank text. Conditional behavior, interactions and final character totals are not simulated."
  },
  "rogue-combat-lightning-reflexes": {
    "texts": [
      "Increases your Dodge chance by 1%.",
      "Increases your Dodge chance by 2%.",
      "Increases your Dodge chance by 3%.",
      "Increases your Dodge chance by 4%.",
      "Increases your Dodge chance by 5%."
    ],
    "hashes": [
      "27b0695f75e444f2db9ec572614ccee81a88f9c12745e6c01825c645e279ee46",
      "ea393d95efa2bef201e7dbed4209595ad17e2cae64a4cf5b8c81f06888cb2a9b",
      "1a8e71776359ec817013d295976de0ea6d0ac5ecad59d61d9ec6874f38b5c8cf",
      "205e3746e6b9f68bac5485a4c29f4e4e25ccc92e77e1fe4ad72bc73c3d0b33b7",
      "42e33b7fa29f6992ce07e459bd82c2af35832468f4014453268a9ed708340d1b"
    ],
    "components": [
      {
        "metric": "dodge-chance",
        "label": "Dodge chance modifier",
        "values": [
          1,
          2,
          3,
          4,
          5
        ],
        "unit": "percentage_points",
        "scope": "Player dodge chance",
        "condition": "Described talent modifier only; no final character chance is computed."
      }
    ],
    "note": "Each listed component follows the pinned rank text. Conditional behavior, interactions and final character totals are not simulated."
  },
  "rogue-combat-deflection": {
    "texts": [
      "Increases your Parry chance by 2%.",
      "Increases your Parry chance by 4%.",
      "Increases your Parry chance by 6%."
    ],
    "hashes": [
      "07240a9050b69ff662ae715041249afdc098187db2b88b2a1c77e145149669af",
      "2652a07379cbf69de107bbb3dd4b55eb0e44559b5b6cac2a3a119b3f131ae526",
      "fb6691191152c2a9602948b3625b6de891c23035dfd7563a3d8db537e5bd399d"
    ],
    "components": [
      {
        "metric": "parry-chance",
        "label": "Parry chance modifier",
        "values": [
          2,
          4,
          6
        ],
        "unit": "percentage_points",
        "scope": "Player parry chance",
        "condition": "Only when the game permits parrying; weapon/ability requirements and final chance are not resolved."
      }
    ],
    "note": "Each listed component follows the pinned rank text. Conditional behavior, interactions and final character totals are not simulated."
  },
  "priest-discipline-mental-strength": {
    "texts": [
      "Increases your total Intellect by 2%.",
      "Increases your total Intellect by 4%.",
      "Increases your total Intellect by 6%.",
      "Increases your total Intellect by 8%.",
      "Increases your total Intellect by 10%."
    ],
    "hashes": [
      "dec34c3a63be093b9ff03211938706308d982f74e6c2d014349194f95d53aa76",
      "e3cdddaaaceaf737b7ec5177e06baa94dff51f44f25d1c50e496a2afaa4ed150",
      "d36b243cad77ce50e676c54de5784dbf6b088a91f82bb81ad3ac2e475f32022f",
      "069cd08fe4d509cd7d0e25dabdff0d6aefd74f8b85e6e0c3a4e1a42ae16d1c09",
      "49c39802ba72cc4203d081607fe838f8f9820bbb5db7b0d41cda4ec260225679"
    ],
    "components": [
      {
        "metric": "intellect",
        "label": "Intellect modifier",
        "values": [
          2,
          4,
          6,
          8,
          10
        ],
        "unit": "percent",
        "scope": "Player total Intellect",
        "condition": "Described talent modifier only; stacking and final base-stat totals are not computed."
      }
    ],
    "note": "Each listed component follows the pinned rank text. Conditional behavior, interactions and final character totals are not simulated."
  },
  "priest-holy-holy-specialization": {
    "texts": [
      "Increases the critical effect chance of your Holy spells by 1%.",
      "Increases the critical effect chance of your Holy spells by 2%.",
      "Increases the critical effect chance of your Holy spells by 3%.",
      "Increases the critical effect chance of your Holy spells by 4%.",
      "Increases the critical effect chance of your Holy spells by 5%."
    ],
    "hashes": [
      "348f038fc819688bfc241b2084737e734dc40887d899ca66d8f1bb9e790999f0",
      "56e3ed569d011e591fdee9d8c1d011f1941fd502ba403b8ce30172021ebe8721",
      "7433fa2cb443e44fe22ea06bce8ce88fb75f20b5459063190050cf4da7af2632",
      "8c249db857612472684c3af951fb6bee5f4585db76930c238590383a1f990eb4",
      "0c52cb5419aea7f29aeb0098f07eb177f46e12865978c139f85ff29ae8480018"
    ],
    "components": [
      {
        "metric": "holy-spell-critical-chance",
        "label": "Holy spell critical chance modifier",
        "values": [
          1,
          2,
          3,
          4,
          5
        ],
        "unit": "percentage_points",
        "scope": "Holy spells only",
        "condition": "Described talent modifier only; no final character chance is computed."
      }
    ],
    "note": "Each listed component follows the pinned rank text. Conditional behavior, interactions and final character totals are not simulated."
  },
  "shaman-enhancement-thundering-strikes": {
    "texts": [
      "Improves your chance to get a critical strike with all spells and attacks by 1%.",
      "Improves your chance to get a critical strike with all spells and attacks by 2%.",
      "Improves your chance to get a critical strike with all spells and attacks by 3%.",
      "Improves your chance to get a critical strike with all spells and attacks by 4%.",
      "Improves your chance to get a critical strike with all spells and attacks by 5%."
    ],
    "hashes": [
      "2938db44c5753a0d812f490aa5862f4df9e2b94251868c89a3fae5011f15bc80",
      "41db0f55210fb41b9e46d7f8166d88851aceb8c4cc3cd18403d14e86b5524deb",
      "4215e82f3551c3eddd81fced37e0c189b48192db4b66ce756a13e097cf293322",
      "b0652d3861f2b7bb6461c159d93c80917b1e34020063e7dae247d1688811f59d",
      "ce33e84177092fab4a31d0ecb725dcc4e5cdb835b558399bfff9b2c4bf6d5811"
    ],
    "components": [
      {
        "metric": "spells-and-attacks-critical-chance",
        "label": "Spell and attack critical chance modifier",
        "values": [
          1,
          2,
          3,
          4,
          5
        ],
        "unit": "percentage_points",
        "scope": "All spells and attacks",
        "condition": "Described talent modifier only; no final character chance is computed."
      }
    ],
    "note": "Each listed component follows the pinned rank text. Conditional behavior, interactions and final character totals are not simulated."
  },
  "shaman-enhancement-ancestral-knowledge": {
    "texts": [
      "Increases your Intellect by 2%.",
      "Increases your Intellect by 4%.",
      "Increases your Intellect by 6%.",
      "Increases your Intellect by 8%.",
      "Increases your Intellect by 10%."
    ],
    "hashes": [
      "b6aa53ac88c091e6be3ad0655473a340ba0dc1e9fe5f988dbfe01bfb6d70eab3",
      "31fa1d0604c2651db449f709c16325ffd938bfd34b3276e3ffba438554b7864f",
      "46ad5537cabc019890ec088a392ae812154413b930ebe7817d8b995255715f4d",
      "89958562906de077f97c1ed262832f560e305fa6e5a0e2d447c6cdad38c6dd2b",
      "846a614f4bcc5042b5ea943b8de20ae3ff30fb46ebc5c45e97a047924dc16614"
    ],
    "components": [
      {
        "metric": "intellect",
        "label": "Intellect modifier",
        "values": [
          2,
          4,
          6,
          8,
          10
        ],
        "unit": "percent",
        "scope": "Player Intellect",
        "condition": "Described talent modifier only; stacking and final base-stat totals are not computed."
      }
    ],
    "note": "Each listed component follows the pinned rank text. Conditional behavior, interactions and final character totals are not simulated."
  },
  "shaman-enhancement-anticipation": {
    "texts": [
      "Increases your chance to dodge by an additional 2%.",
      "Increases your chance to dodge by an additional 4%.",
      "Increases your chance to dodge by an additional 6%."
    ],
    "hashes": [
      "d51a75cce831c0dd6c9ab810279ca54f94b3fbbd81e8a94b3187b1c8a9f580b2",
      "af79b17dc375d37dd47223dda315bdee135d61813bc5a0cd750721bf19630da7",
      "a12232f626d38976c946552ccd2a767e0f04519630245971aa25a7b5c3fab5e3"
    ],
    "components": [
      {
        "metric": "dodge-chance",
        "label": "Dodge chance modifier",
        "values": [
          2,
          4,
          6
        ],
        "unit": "percentage_points",
        "scope": "Player dodge chance",
        "condition": "Described talent modifier only; no final character chance is computed."
      }
    ],
    "note": "Each listed component follows the pinned rank text. Conditional behavior, interactions and final character totals are not simulated."
  },
  "shaman-enhancement-toughness": {
    "texts": [
      "Increases your Stamina by 2%.",
      "Increases your Stamina by 4%.",
      "Increases your Stamina by 6%.",
      "Increases your Stamina by 8%.",
      "Increases your Stamina by 10%."
    ],
    "hashes": [
      "f9a43eb07799f6faf8a0c886e1c04706fb424b98bb9f76e560570b848fa1b2b6",
      "4b3a3182517598d8c55d4574b26c6e0bc99f047ade1a718b092505a3a31741b6",
      "1b56d85fad23b898679a9aa2a1946ab5d4847f3ce2a8008a48965976d752b0bf",
      "467ad658164458495d1759336357992cc7289882fd52b4671017ca1ceab5a116",
      "4045adaa9296ae03f5a848fa8b902671a6b872a5d866dcfdac74153e996c0b05"
    ],
    "components": [
      {
        "metric": "stamina",
        "label": "Stamina modifier",
        "values": [
          2,
          4,
          6,
          8,
          10
        ],
        "unit": "percent",
        "scope": "Player Stamina",
        "condition": "Described talent modifier only; stacking and final base-stat totals are not computed."
      }
    ],
    "note": "Each listed component follows the pinned rank text. Conditional behavior, interactions and final character totals are not simulated."
  },
  "mage-arcane-arcane-mind": {
    "texts": [
      "Increases your Intellect by 2% and increases the critical strike damage bonus of your Arcane spells by 20%.",
      "Increases your Intellect by 4% and increases the critical strike damage bonus of your Arcane spells by 40%.",
      "Increases your Intellect by 6% and increases the critical strike damage bonus of your Arcane spells by 60%.",
      "Increases your Intellect by 8% and increases the critical strike damage bonus of your Arcane spells by 80%.",
      "Increases your Intellect by 10% and increases the critical strike damage bonus of your Arcane spells by 100%."
    ],
    "hashes": [
      "4cf31f230e9e083f6d3bea482858a39cbb58de479014b7ce20279b4be5487eee",
      "163cf1d6a0278e3c1f5fdafcaf3d21b5fd85057fb11a9486162af1b3bba15231",
      "5404e3026a8f18424bd27a5b039690e1add2e819f84057affc1e3bfe52f95218",
      "b26de51c375bf3df32c955b218cd70d8da13090a83684c848593b80c0899087c",
      "6f13d05527d0d63b70fb58d32dd0fb3c9bce4aaaa05f9f0bcc0163fe57b637cb"
    ],
    "components": [
      {
        "metric": "intellect",
        "label": "Intellect modifier",
        "values": [
          2,
          4,
          6,
          8,
          10
        ],
        "unit": "percent",
        "scope": "Player Intellect",
        "condition": "Described talent modifier only; stacking and final base-stat totals are not computed."
      },
      {
        "metric": "arcane-critical-damage-bonus",
        "label": "Arcane critical damage bonus modifier",
        "values": [
          20,
          40,
          60,
          80,
          100
        ],
        "unit": "percent",
        "scope": "Arcane spell critical damage bonus only",
        "condition": "Modifies the critical damage BONUS; not total damage, critical chance or a final critical multiplier."
      }
    ],
    "note": "Each listed component follows the pinned rank text. Conditional behavior, interactions and final character totals are not simulated."
  },
  "mage-arcane-arcane-instability": {
    "texts": [
      "Increases the damage done by your spells by 1% and your critical strike chance by 1%.",
      "Increases the damage done by your spells by 2% and your critical strike chance by 2%.",
      "Increases the damage done by your spells by 3% and your critical strike chance by 3%."
    ],
    "hashes": [
      "a0d4e2451b50f76e873b3a6fd6a392fb9eb0d38806a915305c82f34895e92abf",
      "6aa604327434b449ebd13fa41c56607d7849c87152817f6dae2bca43a9c9154d",
      "a796a8ccc5c7009ee125b0bd15fa317301425cd6a1781e6a051c7dfa45ded2d4"
    ],
    "components": [
      {
        "metric": "spell-damage",
        "label": "Spell damage modifier",
        "values": [
          1,
          2,
          3
        ],
        "unit": "percent",
        "scope": "Damage done by player spells",
        "condition": "Described talent modifier only; stacking and final base-stat totals are not computed."
      },
      {
        "metric": "tooltip-critical-chance",
        "label": "Critical chance modifier",
        "values": [
          1,
          2,
          3
        ],
        "unit": "percentage_points",
        "scope": "The tooltip states critical strike chance without a narrower scope",
        "condition": "Described talent modifier only; no final character chance is computed."
      }
    ],
    "note": "Each listed component follows the pinned rank text. Conditional behavior, interactions and final character totals are not simulated."
  },
  "warlock-demonology-demonic-embrace": {
    "texts": [
      "Increases your total Stamina by 3%.",
      "Increases your total Stamina by 6%.",
      "Increases your total Stamina by 9%.",
      "Increases your total Stamina by 12%.",
      "Increases your total Stamina by 15%."
    ],
    "hashes": [
      "887269bcc599a4b7f799fd2823f863b90865101795cbe9194edcb1165fec89d4",
      "6e7d6a2353b6ebb24785f49251ea1a6a5327fc05c95cd212f2cb3eea56fcd67d",
      "4e1e1ffa1f3b9ba11b7a221c1f7fe5b8505ca3b9632b86330be54a5800c58d5e",
      "005cd3b92e631edc0f85e68540ad1bebaccf3c3e91706ddfdc3e54ce03ce12d4",
      "1e87a47ba44923cd2c01ffd35bfee45ec4f4ec9a5f8fa097b12ed3c5e44ba118"
    ],
    "components": [
      {
        "metric": "stamina",
        "label": "Stamina modifier",
        "values": [
          3,
          6,
          9,
          12,
          15
        ],
        "unit": "percent",
        "scope": "Player total Stamina",
        "condition": "Described talent modifier only; stacking and final base-stat totals are not computed."
      }
    ],
    "note": "Each listed component follows the pinned rank text. Conditional behavior, interactions and final character totals are not simulated."
  },
  "warlock-demonology-fel-vitality": {
    "texts": [
      "Increases the maximum health and Mana of your Imp, Voidwalker, Succubus, Incubus, and Felhunter by 5%, and increases your maximum Mana by 5%.",
      "Increases the maximum health and Mana of your Imp, Voidwalker, Succubus, Incubus, and Felhunter by 10%, and increases your maximum Mana by 10%.",
      "Increases the maximum health and Mana of your Imp, Voidwalker, Succubus, Incubus, and Felhunter by 15%, and increases your maximum Mana by 15%."
    ],
    "hashes": [
      "b1bbfffc3797d906c4fa6c729b1d55e63247826c197ec12048705c3e318bce20",
      "3248a085d0386f06a0d1b044934c13fad600ddaef94ce7ab6ef303ef3ea7a0e1",
      "bd737756de98f35461d9469f08e08b04fca457a97fa9a84c6135c74a8caf86d8"
    ],
    "components": [
      {
        "metric": "maximum-mana",
        "label": "Maximum Mana modifier",
        "values": [
          5,
          10,
          15
        ],
        "unit": "percent",
        "scope": "Player maximum Mana",
        "condition": "Described talent modifier only; stacking and final base-stat totals are not computed."
      },
      {
        "metric": "pet-health",
        "label": "Pet Health modifier",
        "values": [
          5,
          10,
          15
        ],
        "unit": "percent",
        "scope": "Imp, Voidwalker, Succubus, Incubus and Felhunter only",
        "condition": "Applies to the named pets; never added to player Health."
      },
      {
        "metric": "pet-mana",
        "label": "Pet Mana modifier",
        "values": [
          5,
          10,
          15
        ],
        "unit": "percent",
        "scope": "Imp, Voidwalker, Succubus, Incubus and Felhunter only",
        "condition": "Applies to the named pets; separate from the player Mana modifier."
      }
    ],
    "note": "Each listed component follows the pinned rank text. Conditional behavior, interactions and final character totals are not simulated."
  },
  "druid-balance-nature-s-majesty": {
    "texts": [
      "Increases your critical strike chance with spells and melee attacks by 2%.",
      "Increases your critical strike chance with spells and melee attacks by 4%."
    ],
    "hashes": [
      "dfc65f67a4989fa1e98855187c7ce0377f0eec398ba416449f06126164208a8b",
      "1704cb32c057823835dc91914c500bb59d25e2873edebb3bcf5e80098d9de27d"
    ],
    "components": [
      {
        "metric": "spells-and-melee-critical-chance",
        "label": "Spell and melee critical chance modifier",
        "values": [
          2,
          4
        ],
        "unit": "percentage_points",
        "scope": "Spells and melee attacks",
        "condition": "Described talent modifier only; no final character chance is computed."
      }
    ],
    "note": "Each listed component follows the pinned rank text. Conditional behavior, interactions and final character totals are not simulated."
  },
  "druid-feral-combat-heart-of-the-wild": {
    "texts": [
      "Increases your Intellect by 2%. In addition, while in Bear Form or Dire Bear Form your Stamina is increased by 4% and while in Cat Form your Strength is increased by 2%.",
      "Increases your Intellect by 4%. In addition, while in Bear Form or Dire Bear Form your Stamina is increased by 8% and while in Cat Form your Strength is increased by 4%.",
      "Increases your Intellect by 6%. In addition, while in Bear Form or Dire Bear Form your Stamina is increased by 12% and while in Cat Form your Strength is increased by 6%.",
      "Increases your Intellect by 8%. In addition, while in Bear Form or Dire Bear Form your Stamina is increased by 16% and while in Cat Form your Strength is increased by 8%.",
      "Increases your Intellect by 10%. In addition, while in Bear Form or Dire Bear Form your Stamina is increased by 20% and while in Cat Form your Strength is increased by 10%."
    ],
    "hashes": [
      "c6fcb99a656d7fbed7d7fda1fca0d3de179229274ab68ec06b719d00f76d27e5",
      "511db6a2a1622fce57644ddaee8da31c64c8233ec773d89db295769072975b80",
      "424c7843264b4ca9f8f257d0b5d6f86dd969063cffff8cde764eae1cca7ea18b",
      "e5d438c0d59f27b0d0d3d286a3fe7dcc1b54261c00799a97f505ed9fb81ccb8b",
      "9784ef4a22396c2ea3df5cb20f42d8d9f1ab9fcd131f33d11a94c4866a1469da"
    ],
    "components": [
      {
        "metric": "intellect",
        "label": "Intellect modifier",
        "values": [
          2,
          4,
          6,
          8,
          10
        ],
        "unit": "percent",
        "scope": "Player Intellect",
        "condition": "Described talent modifier only; stacking and final base-stat totals are not computed."
      },
      {
        "metric": "bear-stamina",
        "label": "Bear Stamina modifier",
        "values": [
          4,
          8,
          12,
          16,
          20
        ],
        "unit": "percent",
        "scope": "Player Stamina",
        "condition": "Only in Bear Form or Dire Bear Form; not assumed active."
      },
      {
        "metric": "cat-strength",
        "label": "Cat Strength modifier",
        "values": [
          2,
          4,
          6,
          8,
          10
        ],
        "unit": "percent",
        "scope": "Player Strength",
        "condition": "Only in Cat Form; not assumed active."
      }
    ],
    "note": "Each listed component follows the pinned rank text. Conditional behavior, interactions and final character totals are not simulated."
  }
,
  "warrior-arms-improved-heroic-strike": {
    "texts": [
      "Reduces the cost of your Heroic Strike ability by 1 Rage.",
      "Reduces the cost of your Heroic Strike ability by 2 Rage.",
      "Reduces the cost of your Heroic Strike ability by 3 Rage."
    ],
    "hashes": [
      "ee21ac8bb2d52bd1cb672d1b9c793a6767f64e91394a1a46bf69e56a739a5968",
      "6d713ade2e85cb160a8d1ccf756375ae4c483ecdc6d6694daffc2398ae3496d2",
      "afa6d100a9fb5621ad8dc35b8928bc1c283648515d12da770dcb786327dd0133"
    ],
    "components": [
      {
        "metric": "heroic-strike-rage-reduction",
        "label": "Heroic Strike Rage cost reduction",
        "values": [
          1,
          2,
          3
        ],
        "unit": "Rage",
        "scope": "Heroic Strike only",
        "condition": "A stated reduction, not final cost, Rage regeneration or DPS. Other reductions and resource floors are not resolved."
      }
    ],
    "note": "Each listed component follows the pinned rank text. Conditional behavior, interactions and final character totals are not simulated."
  },
  "paladin-holy-healing-light": {
    "texts": [
      "Increases the amount healed by your Holy Light, Flash of Light, and Holy Shock spells by 4%.",
      "Increases the amount healed by your Holy Light, Flash of Light, and Holy Shock spells by 8%.",
      "Increases the amount healed by your Holy Light, Flash of Light, and Holy Shock spells by 12%."
    ],
    "hashes": [
      "b53f8732dde9a562fc5bf3f7f66649675d8ecfd3683fe9ef6dd8b81b6f7a0b54",
      "ffd217c46a405241ff6200852016c23077b4338220f10c5c7037640300024e1a",
      "28d4698fc8224c1a186768a6faa857a3a7054f40b9e56f6225ddccd1aef1af92"
    ],
    "components": [
      {
        "metric": "named-healing-bonus",
        "label": "Named healing spell modifier",
        "values": [
          4,
          8,
          12
        ],
        "unit": "percent",
        "scope": "Holy Light, Flash of Light and Holy Shock only",
        "condition": "No other healing spell is included. Spell coefficients, stacking, critical heals and final healing or HPS are not resolved."
      }
    ],
    "note": "Each listed component follows the pinned rank text. Conditional behavior, interactions and final character totals are not simulated."
  },
  "paladin-holy-holy-power": {
    "texts": [
      "Increases the critical strike chance of your Holy Shock and Holy Strike spells by 3%, and all other spells by 1%.",
      "Increases the critical strike chance of your Holy Shock and Holy Strike spells by 6%, and all other spells by 2%.",
      "Increases the critical strike chance of your Holy Shock and Holy Strike spells by 9%, and all other spells by 3%.",
      "Increases the critical strike chance of your Holy Shock and Holy Strike spells by 12%, and all other spells by 4%.",
      "Increases the critical strike chance of your Holy Shock and Holy Strike spells by 15%, and all other spells by 5%."
    ],
    "hashes": [
      "04ce179377662638ccd5c7e3963e94f1df55fdaba270651f9db381c310efcdf2",
      "49c7360ea5ca2b27716d14fde6d69493ffed8498df106fff0d3986d9d0044c2a",
      "423cd2d3c6e315a6523116de84dcbdad06317cd7ec2a9a042668a91d21a0138b",
      "f8729f9059e443dbfd767cee79b150dae82c6c2628506cadce4a208a9563d060",
      "4083c5a66bb4cbe6f21b8b11cc9183beaf5b571e22f46ce5a85707596b0a132d"
    ],
    "components": [
      {
        "metric": "holy-shock-strike-critical-chance",
        "label": "Holy Shock and Holy Strike critical chance modifier",
        "values": [
          3,
          6,
          9,
          12,
          15
        ],
        "unit": "percentage_points",
        "scope": "Holy Shock and Holy Strike only",
        "condition": "Separate from the other-spell component; the two are not added. Final critical chance is unavailable."
      },
      {
        "metric": "other-spells-critical-chance",
        "label": "Other spell critical chance modifier",
        "values": [
          1,
          2,
          3,
          4,
          5
        ],
        "unit": "percentage_points",
        "scope": "All other spells, excluding Holy Shock and Holy Strike",
        "condition": "Excludes the named spells in the other component. Final critical chance and spell eligibility are not resolved."
      }
    ],
    "note": "Each listed component follows the pinned rank text. Conditional behavior, interactions and final character totals are not simulated."
  },
  "priest-discipline-wand-specialization": {
    "texts": [
      "Increases your damage with Wands by 13%.",
      "Increases your damage with Wands by 25%."
    ],
    "hashes": [
      "ed941543d4f85d692db14d97ada82ed7e2abab2c5a7f798bd0adc99881ea5b00",
      "66fc7459ba2be7662d7654fa4e781f6eaad67ef435254ee919da152baadf0e52"
    ],
    "components": [
      {
        "metric": "wand-damage",
        "label": "Wand damage modifier",
        "values": [
          13,
          25
        ],
        "unit": "percent",
        "scope": "Damage with Wands only",
        "condition": "Requires a wand; it has no assumed effect on an unequipped character. Attack speed, target mitigation and final DPS are not resolved."
      }
    ],
    "note": "Each listed component follows the pinned rank text. Conditional behavior, interactions and final character totals are not simulated."
  },
  "mage-arcane-wand-specialization": {
    "texts": [
      "Increases your damage with Wands by 13%.",
      "Increases your damage with Wands by 25%."
    ],
    "hashes": [
      "ed941543d4f85d692db14d97ada82ed7e2abab2c5a7f798bd0adc99881ea5b00",
      "66fc7459ba2be7662d7654fa4e781f6eaad67ef435254ee919da152baadf0e52"
    ],
    "components": [
      {
        "metric": "wand-damage",
        "label": "Wand damage modifier",
        "values": [
          13,
          25
        ],
        "unit": "percent",
        "scope": "Damage with Wands only",
        "condition": "Requires a wand; it has no assumed effect on an unequipped character. Attack speed, target mitigation and final DPS are not resolved."
      }
    ],
    "note": "Each listed component follows the pinned rank text. Conditional behavior, interactions and final character totals are not simulated."
  },
  "shaman-elemental-elemental-fury": {
    "texts": [
      "Increases the critical strike damage bonus of your Searing and Magma Totems and your Fire, Frost, and Nature spells by 20%.",
      "Increases the critical strike damage bonus of your Searing and Magma Totems and your Fire, Frost, and Nature spells by 40%.",
      "Increases the critical strike damage bonus of your Searing and Magma Totems and your Fire, Frost, and Nature spells by 60%.",
      "Increases the critical strike damage bonus of your Searing and Magma Totems and your Fire, Frost, and Nature spells by 80%.",
      "Increases the critical strike damage bonus of your Searing and Magma Totems and your Fire, Frost, and Nature spells by 100%."
    ],
    "hashes": [
      "9975ac09d59d8945d49513f71875e3a355146ff8c69d8c538aca59df86673929",
      "65f89c50cf6f8361931902f21b69b57e6f89eb2af0fbab6e71f2ef94546c6e1e",
      "376e1ff317c2da2a8acf8a612adf03ae47e102ed4b04b97b4d5c42b6fc5bdfff",
      "7a0eabe5435cc397ac0e0025451486fdc6e69340d1c6c9c89b9d46753349d822",
      "7997c3b1c5fd3b5336f1d6ff7a4c3bae224a67b91ceceb4daa1ecba3310f6028"
    ],
    "components": [
      {
        "metric": "elemental-critical-damage-bonus",
        "label": "Named elemental critical damage bonus modifier",
        "values": [
          20,
          40,
          60,
          80,
          100
        ],
        "unit": "percent",
        "scope": "Searing and Magma Totems; Fire, Frost and Nature spells",
        "condition": "Modifies the critical strike damage bonus, not total damage or the final critical multiplier. It does not increase critical chance. Stacking and final DPS are not resolved."
      }
    ],
    "note": "Each listed component follows the pinned rank text. Conditional behavior, interactions and final character totals are not simulated."
  },
  "warrior-fury-furious-precision": {
    "texts": [
      "Increases your chance to hit with off-hand attacks by 4%.",
      "Increases your chance to hit with off-hand attacks by 7%.",
      "Increases your chance to hit with off-hand attacks by 10%."
    ],
    "hashes": [
      "fde17898dd08e438b4a368641533d1859de43921ce6d91dd49017dde5eb979a9",
      "814e63e94d81e08ea37cc02a38bf22d510b7d3159e9cc011a3a724f09618cfb9",
      "a695434c59886ddfcf4fbd598be6c58f01d012edec546b82223d75c9e8a4b36c"
    ],
    "components": [
      {
        "metric": "off-hand-hit-chance",
        "label": "Off-hand hit chance modifier",
        "values": [
          4,
          7,
          10
        ],
        "unit": "percentage_points",
        "scope": "Player off-hand attacks only",
        "condition": "Requires an off-hand attack; no assumed effect for an unequipped character, main-hand attacks or spells. Final hit chance, caps and attack tables are not resolved."
      }
    ],
    "note": "Each listed component follows the pinned rank text. Conditional behavior, interactions and final character totals are not simulated."
  },
  "paladin-holy-divine-precision": {
    "texts": [
      "Improves your chance to hit with Holy spells by 6%.",
      "Improves your chance to hit with Holy spells by 12%.",
      "Improves your chance to hit with Holy spells by 18%."
    ],
    "hashes": [
      "d12ffdefb21e46722661f4bb202b77b85ea6eadfd53e2a4240fcf330df8948b9",
      "d6418b2cb9807cd7cdc5b676616901827bf0551ea29e8d3864b0b1ef9891957b",
      "d3089c07d73db0a6dad988a6eb65a98b33b5750e621aa78fcb0cbf08a2625841"
    ],
    "components": [
      {
        "metric": "holy-spell-hit-chance",
        "label": "Holy spell hit chance modifier",
        "values": [
          6,
          12,
          18
        ],
        "unit": "percentage_points",
        "scope": "Player Holy spells only",
        "condition": "Does not increase melee hit chance or hit chance for other spell schools. Final hit chance, caps and target level are not resolved."
      }
    ],
    "note": "Each listed component follows the pinned rank text. Conditional behavior, interactions and final character totals are not simulated."
  },
  "hunter-beast-mastery-endurance-training": {
    "texts": [
      "Increases the Health and Armor of your pets by 3%.",
      "Increases the Health and Armor of your pets by 6%.",
      "Increases the Health and Armor of your pets by 9%.",
      "Increases the Health and Armor of your pets by 12%.",
      "Increases the Health and Armor of your pets by 15%."
    ],
    "hashes": [
      "21769c78d5b7468fc06bbfb309b59a6b731e8dffeb9c0dbd41f0a75851fb7879",
      "08053440e1a95f0c00dc17cc2a9f45b210d2abf373429801f5c725989251c661",
      "f9a5240a66cf5cb5b3654687254cbeb8f3d0caa0d332e6a50df4f15e34b19a9c",
      "7f2b9ef3ba838d18ac57628e3f6b6521d393bd612aa0509e0656f56d47e8c23b",
      "2267a37305fd5718924aba7e7f3e4ed74e8d1fd90785a6773a6a2001ad0c9b4e"
    ],
    "components": [
      {
        "metric": "pet-health",
        "label": "Pet Health modifier",
        "values": [
          3,
          6,
          9,
          12,
          15
        ],
        "unit": "percent",
        "scope": "Hunter pets only: Health",
        "condition": "Pet-only effect; never added to player Health or treated as active with no pet. Pet base Health, inheritance and final totals are unavailable."
      },
      {
        "metric": "pet-armor",
        "label": "Pet Armor modifier",
        "values": [
          3,
          6,
          9,
          12,
          15
        ],
        "unit": "percent",
        "scope": "Hunter pets only: Armor",
        "condition": "Pet-only effect; never added to player Armor or treated as active with no pet. Pet base Armor, inheritance and final mitigation are unavailable."
      }
    ],
    "note": "Each listed component follows the pinned rank text. Conditional behavior, interactions and final character totals are not simulated."
  },
  "rogue-assassination-lethality": {
    "texts": [
      "Increases the critical strike damage bonus of your Sinister Strike, Gouge, Backstab, Mutilate, Ghostly Strike, and Hemorrhage abilities by 4%.",
      "Increases the critical strike damage bonus of your Sinister Strike, Gouge, Backstab, Mutilate, Ghostly Strike, and Hemorrhage abilities by 8%.",
      "Increases the critical strike damage bonus of your Sinister Strike, Gouge, Backstab, Mutilate, Ghostly Strike, and Hemorrhage abilities by 12%.",
      "Increases the critical strike damage bonus of your Sinister Strike, Gouge, Backstab, Mutilate, Ghostly Strike, and Hemorrhage abilities by 16%.",
      "Increases the critical strike damage bonus of your Sinister Strike, Gouge, Backstab, Mutilate, Ghostly Strike, and Hemorrhage abilities by 20%."
    ],
    "hashes": [
      "e0942bf154e3d95d76ff16c0f2d77b99fcf7cb9909ce9c2cd12dbbb59fd80b1a",
      "a4b13000ffeff75f6e6bb33467d822acc8bcda5c16b83825370dd816aee8edbb",
      "83d55ab53a93c37bbcf1ed8238bf611237878a97830455978d119c7876229ef5",
      "90e9764290207da36b6cb3a0e3ea75f68d73ba47e2899d0aa51635780983762e",
      "2349cfa685ea56c3edadeaab13904351c17fc00c17ef67fb3d71b01e33ae2e15"
    ],
    "components": [
      {
        "metric": "lethality-critical-damage-bonus",
        "label": "Named-ability critical damage bonus modifier",
        "values": [
          4,
          8,
          12,
          16,
          20
        ],
        "unit": "percent",
        "scope": "Sinister Strike, Gouge, Backstab, Mutilate, Ghostly Strike and Hemorrhage only",
        "condition": "Modifies the critical strike damage bonus, not total damage or the final critical multiplier. Does not increase critical chance or affect unlisted abilities, auto-attacks or poisons. Final DPS and interactions are not resolved."
      }
    ],
    "note": "Each listed component follows the pinned rank text. Conditional behavior, interactions and final character totals are not simulated."
  },
  "priest-holy-spell-warding": {
    "texts": [
      "Reduces all spell damage taken by 2%.",
      "Reduces all spell damage taken by 4%.",
      "Reduces all spell damage taken by 6%.",
      "Reduces all spell damage taken by 8%.",
      "Reduces all spell damage taken by 10%."
    ],
    "hashes": [
      "34e241513e3ea40bef1c044ad6d2d5ce2fb2365efb1194afdb8dde8cd42492eb",
      "eb4066c15885dd8f377e22d5ffca6fc914313d146ce4acbb3047070d85b6c042",
      "1f56179587b5acc4c8ff1f2a43a77e7e634a05e97fa07c304540dfcc7fd8e678",
      "af65e5a33a580a77b1103ac7dbfada28567deee36eb3c0c1b8c45e86ef034a96",
      "cda8071718cf207e8af1d05d2bfe6bf1ac3e882e7a2a14fb2027a769a11bcc07"
    ],
    "components": [
      {
        "metric": "spell-damage-taken-reduction",
        "label": "Spell damage taken reduction",
        "values": [
          2,
          4,
          6,
          8,
          10
        ],
        "unit": "percent",
        "scope": "Spell damage taken by the player",
        "condition": "A positive value describes damage reduction, not increased damage taken. Applies to spell damage only, not all incoming damage or outgoing spell damage. Stacking, resistance and final survivability are not resolved."
      }
    ],
    "note": "Each listed component follows the pinned rank text. Conditional behavior, interactions and final character totals are not simulated."
  },
  "shaman-restoration-tidal-focus": {
    "texts": [
      "Reduces the Mana cost of your healing spells by 1% and improves your chance to hit by 1%.",
      "Reduces the Mana cost of your healing spells by 2% and improves your chance to hit by 2%.",
      "Reduces the Mana cost of your healing spells by 3% and improves your chance to hit by 3%.",
      "Reduces the Mana cost of your healing spells by 4% and improves your chance to hit by 4%.",
      "Reduces the Mana cost of your healing spells by 5% and improves your chance to hit by 5%."
    ],
    "hashes": [
      "670670b7522de4e1ee999a66f2a58a6f97697d6fc8d9bb7d0cb06336e8ea6687",
      "b259cb264e6f1a1189cb6b0b5a31da294a28c8f7b329d5efe62e6c0339ccf617",
      "8b98914c371bf8ab9ebcebd8700869bdcd8e76760d7a3315c2da33c3c7f0d9cd",
      "374bd6c3e2309ee6e8c31cb29ff19074076b0111915a594697db07eb62612a28",
      "e788e34c1ee03d715d6470970fda186fe733e8b68c5f2c06ecdbc48c4b98f554"
    ],
    "components": [
      {
        "metric": "healing-spell-mana-reduction",
        "label": "Healing spell Mana cost reduction",
        "values": [
          1,
          2,
          3,
          4,
          5
        ],
        "unit": "percent",
        "scope": "Player healing spells only: Mana cost",
        "condition": "A positive value describes a cost reduction, not additional Mana or final cost. Does not apply to damaging spells. Base costs, stacking, rounding and final HPM/HPS are unavailable."
      },
      {
        "metric": "tidal-focus-hit-chance",
        "label": "Hit chance modifier as described",
        "values": [
          1,
          2,
          3,
          4,
          5
        ],
        "unit": "percentage_points",
        "scope": "Player hit chance as written; no attack or spell-school restriction is specified",
        "condition": "Shown separately from the healing-spell Mana reduction. The tooltip does not specify an attack type or school, so none is inferred. Final hit chance, caps and target level are not resolved."
      }
    ],
    "note": "Each listed component follows the pinned rank text. Conditional behavior, interactions and final character totals are not simulated."
  },
  "mage-arcane-arcane-impact": {
    "texts": [
      "Increases the critical strike chance of your Arcane spells by 2%.",
      "Increases the critical strike chance of your Arcane spells by 4%.",
      "Increases the critical strike chance of your Arcane spells by 6%."
    ],
    "hashes": [
      "b5411399112482c0f891e0db94a568319cc7423aa7106c91d72feab7306af0a5",
      "a3dc468252d45be379ead50ed221128a07d999a2d0be988dc1393303c739c506",
      "f30662e13ed42fe084b5a3aceb2729ce2a309dccf6800e931e8278c509cfc524"
    ],
    "components": [
      {
        "metric": "arcane-spell-critical-chance",
        "label": "Arcane spell critical chance modifier",
        "values": [
          2,
          4,
          6
        ],
        "unit": "percentage_points",
        "scope": "Player Arcane spells only",
        "condition": "Does not increase critical damage, melee critical chance or the critical chance of other spell schools. Final critical chance, caps and interactions are not resolved."
      }
    ],
    "note": "Each listed component follows the pinned rank text. Conditional behavior, interactions and final character totals are not simulated."
  },
  "warlock-destruction-molten-skin": {
    "texts": [
      "Reduces all damage taken by 2%.",
      "Reduces all damage taken by 4%.",
      "Reduces all damage taken by 6%.",
      "Reduces all damage taken by 8%.",
      "Reduces all damage taken by 10%."
    ],
    "hashes": [
      "0f58c7ce6781d154dbf6e06722b984e7caa682a84bfe8d56786bcbce83731aaa",
      "ff3483d7612177c4ea1134358b35c18467267f8720394022202ad0474f984cc1",
      "ae48b37a78cfc30149058935557fe8506d14cb70b007d293579d6d5fc69c9841",
      "1eac7b78a3b7c8d8838f9bbd13e9bdf8a4eaa22b295cbcb171993be3d8205491",
      "80addfd0e7ff61b6cf10892b3283d20471cbf0bfbf1c82af6972a7bfb27c1942"
    ],
    "components": [
      {
        "metric": "all-damage-taken-reduction",
        "label": "All damage taken reduction",
        "values": [
          2,
          4,
          6,
          8,
          10
        ],
        "unit": "percent",
        "scope": "All damage taken by the player",
        "condition": "A positive value describes damage reduction, not increased damage taken or outgoing damage. Not added to separate school-specific reductions; stacking, rounding and final survivability are not resolved."
      }
    ],
    "note": "Each listed component follows the pinned rank text. Conditional behavior, interactions and final character totals are not simulated."
  },
  "druid-feral-combat-sharpened-claws": {
    "texts": [
      "Increases your critical strike chance while in Bear Form, Dire Bear Form, or Cat Form by 3%.",
      "Increases your critical strike chance while in Bear Form, Dire Bear Form, or Cat Form by 6%."
    ],
    "hashes": [
      "9b7928f07870605d75737ec217ed7a79df7c2529603dea2a2adf343577f5a5c4",
      "7c4ef149b27789b5c77207a8d15f3c255686b91f19cfa68a549272614afc8c45"
    ],
    "components": [
      {
        "metric": "feral-form-critical-chance",
        "label": "Bear/Dire Bear/Cat critical chance modifier",
        "values": [
          3,
          6
        ],
        "unit": "percentage_points",
        "scope": "Player in Bear Form, Dire Bear Form or Cat Form only",
        "condition": "Only in one of the three named forms; not assumed active in humanoid or Moonkin Form. Forms are alternatives, not additive effects. Final critical chance and interactions are not resolved."
      }
    ],
    "note": "Each listed component follows the pinned rank text. Conditional behavior, interactions and final character totals are not simulated."
  }
};
  function freeze(value) { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
  freeze(MAPPINGS);
  const MISSING = Object.freeze(["Verified level-60 class/race base attributes and base health/mana", "Attribute-to-health, mana, armor, attack power and critical-chance conversions", "Stacking order, rounding and spell/form/weapon interactions", "Proc uptime, cooldown/GCD sequences, resource regeneration and rotations", "Target armor, resistance, hit/avoidance and encounter assumptions", "Sustained DPS, HPS, survivability and best-build rankings", "Legacy Talented extra talent points"]);
  const unavailableReason = "Verified level-60 class/race base-stat tables are not included in this snapshot. Talent percentages alone cannot establish an unequipped character's final stats.";
  // Small synchronous UTF-8 SHA-256, so a changed tooltip cannot silently keep an old numeric interpretation.
  function sha256(text) {
    const bytes = new TextEncoder().encode(text), length = bytes.length;
    const block = new Uint8Array(((length + 9 + 63) >> 6) << 6); block.set(bytes); block[length] = 128;
    const view = new DataView(block.buffer); view.setUint32(block.length - 8, Math.floor(length / 0x20000000)); view.setUint32(block.length - 4, (length * 8) >>> 0);
    const K = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
    const H=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19], w=new Uint32Array(64), rr=(n,b)=>(n>>>b)|(n<<(32-b));
    for(let offset=0;offset<block.length;offset+=64){
      for(let i=0;i<16;i++)w[i]=view.getUint32(offset+i*4);
      for(let i=16;i<64;i++){const a=w[i-15],b=w[i-2],s0=rr(a,7)^rr(a,18)^(a>>>3),s1=rr(b,17)^rr(b,19)^(b>>>10);w[i]=(w[i-16]+s0+w[i-7]+s1)>>>0;}
      let [a,b,c,d,e,f,g,h]=H;
      for(let i=0;i<64;i++){const s1=rr(e,6)^rr(e,11)^rr(e,25),ch=(e&f)^(~e&g),t1=(h+s1+ch+K[i]+w[i])>>>0,s0=rr(a,2)^rr(a,13)^rr(a,22),maj=(a&b)^(a&c)^(b&c),t2=(s0+maj)>>>0;h=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0;}
      [a,b,c,d,e,f,g,h].forEach((n,i)=>{H[i]=(H[i]+n)>>>0;});
    }
    return H.map(n=>n.toString(16).padStart(8,"0")).join("");
  }
  function inventory(data) {
    if (!data || data.schema !== "olympus-talents-v1" || !Array.isArray(data.classes) || data.classes.length !== 9) throw Error("A complete nine-class talent snapshot is required.");
    return data.classes.map((cls,index) => {
      if (cls.id !== CLASS_IDS[index] || !Array.isArray(cls.trees) || cls.trees.length !== 3) throw Error("A class needs its three talent trees.");
      let at=0;const nodes=cls.trees.flatMap(tree=>tree.talents.map(talent=>({talent,tree,index:at++})));
      if(nodes.some(n=>typeof n.talent.id!=="string"||!Number.isInteger(n.talent.maxRank)||!Array.isArray(n.talent.descriptions)||n.talent.descriptions.length!==n.talent.maxRank||n.talent.descriptions.some(t=>typeof t!=="string")))throw Error("Incomplete talent rank text.");
      return {cls,nodes};
    });
  }
  function checkedBuild(entry,build) {
    if(!build||build.className!==entry.cls.id||!Number.isInteger(build.level)||build.level<10||build.level>60||!Array.isArray(build.ranks)||build.ranks.length!==entry.nodes.length)throw Error("Choose a legal class, level and rank vector.");
    const ranks=Array.from(build.ranks), total=ranks.reduce((sum,r,i)=>{if(!Object.hasOwn(build.ranks,i)||!Number.isInteger(r)||r<0||r>entry.nodes[i].talent.maxRank)throw Error("Invalid talent rank.");return sum+r;},0);
    if(total>build.level-9)throw Error("Talent points exceed the selected level.");
    const byId=new Map(entry.nodes.map(n=>[n.talent.id,n]));
    entry.nodes.forEach(n=>{if(!ranks[n.index])return;const earlier=entry.nodes.filter(p=>p.tree.id===n.tree.id&&p.talent.row<n.talent.row).reduce((sum,p)=>sum+ranks[p.index],0);if(earlier<(n.talent.row-1)*5)throw Error("Talent row requirement is not met.");if(n.talent.requires){const prior=byId.get(n.talent.requires);if(!prior||ranks[prior.index]!==prior.talent.maxRank)throw Error("Talent prerequisite is not met.");}});
    return {className:build.className,level:build.level,ranks,total};
  }
  function mappingStatus(data,talent) {
    const map=Object.hasOwn(MAPPINGS,talent.id)?MAPPINGS[talent.id]:null;if(!map)return {map:null,reason:"Description only: this talent has no reviewed numeric component mapping."};
    if(data.revision!==SOURCE.revision||data.source?.rawSHA256!==SOURCE.rawSHA256)return {map:null,reason:"Numeric mapping withheld: the source revision differs from its reviewed snapshot."};
    if(talent.maxRank!==map.texts.length||talent.descriptions.some((text,i)=>text!==map.texts[i]||sha256(text)!==map.hashes[i]))return {map:null,reason:"Numeric mapping withheld: the exact rank text or hash changed."};
    return {map,reason:map.note||"Only the listed components are quantified; no final character total is inferred."};
  }
  function analyze(data,build,comparisonBuild=null) {
    const all=inventory(data),entry=all.find(e=>e.cls.id===build?.className);if(!entry)throw Error("Unknown character class.");
    const current=checkedBuild(entry,build),empty={className:entry.cls.id,level:60,ranks:entry.nodes.map(()=>0)},before=checkedBuild(entry,comparisonBuild||empty);
    const source={...SOURCE,declaredRevision:typeof data.revision==="string"?data.revision:null,declaredRawSHA256:typeof data.source?.rawSHA256==="string"?data.source.rawSHA256:null,numericMappingVerification:"Exact expected text and SHA256 per mapped talent",normalizedSHA256IsPublishedPinOnly:true};
    const nodes=entry.nodes.map(n=>{
      const rank=current.ranks[n.index],priorRank=before.ranks[n.index],status=mappingStatus(data,n.talent);
      return {id:n.talent.id,name:n.talent.name,treeId:n.tree.id,tree:n.tree.name,maxRank:n.talent.maxRank,rank,priorRank,change:rank===priorRank?"unchanged":!priorRank?"added":!rank?"removed":"changed",currentText:rank?n.talent.descriptions[rank-1]:"No points allocated.",priorText:priorRank?n.talent.descriptions[priorRank-1]:"No points allocated.",currentTextSHA256:rank?sha256(n.talent.descriptions[rank-1]):null,priorTextSHA256:priorRank?sha256(n.talent.descriptions[priorRank-1]):null,mappingVerified:!!status.map,mappingReason:status.reason,components:status.map?status.map.components.map(c=>({metric:c.metric,label:c.label,unit:c.unit,scope:c.scope,condition:c.condition,after:rank?c.values[rank-1]:0,before:priorRank?c.values[priorRank-1]:0,delta:(rank?c.values[rank-1]:0)-(priorRank?c.values[priorRank-1]:0),composition:"Separate source-described modifier; not combined with other talents or final base stats."})):[]};
    });
    const selected=nodes.filter(n=>n.rank||n.priorRank),effects=selected.flatMap(n=>n.components.map(c=>({...c,talentId:n.id,talent:n.name,change:n.change,note:n.mappingReason})));
    const coverage={classes:all.length,trees:all.reduce((sum,e)=>sum+e.cls.trees.length,0),talents:all.reduce((sum,e)=>sum+e.nodes.length,0),classTalents:nodes.length,selectedTalents:selected.filter(n=>n.rank).length,selectedTalentsWithNumericComponents:selected.filter(n=>n.rank&&n.mappingVerified).length,selectedDescriptionOnly:selected.filter(n=>n.rank&&!n.mappingVerified).length,numericMappingsWithheld:nodes.filter(n=>Object.hasOwn(MAPPINGS,n.id)&&!n.mappingVerified).length,reviewedMappingTalents:nodes.filter(n=>n.mappingVerified).length,numericComponents:effects.length,allTalentsHaveExactRankText:true,completeNumericalModel:false};
    return {schema:"olympus-talent-analysis-v1",className:entry.cls.id,classLabel:entry.cls.name,source,current,before,baseline:{...empty,kind:"empty-talent-allocation",nakedCharacterStatsAvailable:false,reason:unavailableReason},comparisonKind:comparisonBuild?"saved-build":"empty-level60-allocation",trees:entry.cls.trees.map(tree=>({id:tree.id,name:tree.name,current:entry.nodes.filter(n=>n.tree.id===tree.id).reduce((s,n)=>s+current.ranks[n.index],0),before:entry.nodes.filter(n=>n.tree.id===tree.id).reduce((s,n)=>s+before.ranks[n.index],0)})),nodes,changes:selected.filter(n=>n.change!=="unchanged"),effects,coverage,missingMetrics:Array.from(MISSING),totals:null,limitations:[unavailableReason,"Numbers below are individually scoped talent modifiers, not additional final stats or a ranking of builds.","Conditional effects are shown separately and never assumed active; numeric components are not summed.","Tooltip data is a fan-maintained beta snapshot and can lag server tuning."]};
  }
  function mount(host,options={}) {
    if(!host||!host.ownerDocument||typeof host.appendChild!=="function")throw Error("An analysis host is required.");
    const doc=host.ownerDocument,data=options.data;let build=options.build,comparison=options.comparisonBuild||null,dead=false;
    const el=(tag,text,cls)=>{const n=doc.createElement(tag);if(text!==undefined)n.textContent=String(text);if(cls)n.className=cls;return n;};
    const add=(n,...children)=>{children.flat().forEach(c=>{if(c)n.appendChild(c);});return n;};
    const section=el("section",undefined,"talent-analysis"),heading=el("h2","Build comparison"),intro=el("p","Compare talent choices and their stated effects. This is not a damage or healing simulator.","muted small"),controls=el("div",undefined,"btn-row"),capture=el("button","Use current as comparison","btn small"),reset=el("button","Compare with no talents","btn small"),outcome=el("p","","talent-analysis-outcome small muted"),body=el("div",undefined,"talent-analysis-body");
    // .186: one persistent polite line states what a comparison button did; point updates never write to it.
    capture.type=reset.type="button";heading.setAttribute("tabindex","-1");outcome.setAttribute("role","status");outcome.setAttribute("aria-live","polite");add(controls,capture,reset);add(section,heading,intro,controls,outcome,body);host.appendChild(section);
    function table(headers,rows,label){const wrap=el("div",undefined,"table-wrap"),t=el("table",undefined,"data talent-analysis-table");t.setAttribute("aria-label",label);const head=el("thead"),tr=el("tr");headers.forEach(s=>{const th=el("th",s);th.setAttribute("scope","col");tr.appendChild(th);});head.appendChild(tr);t.appendChild(head);const tb=el("tbody");rows.forEach(row=>{const tr=el("tr");row.forEach((value,i)=>{const td=el(i===0?"th":"td",value);if(i===0)td.setAttribute("scope","row");td.className="wrap";tr.appendChild(td);});tb.appendChild(tr);});t.appendChild(tb);wrap.appendChild(t);return wrap;}
    const value=(n,unit)=>String(n)+(unit==="percent"?"%":unit==="percentage_points"?" pp":unit==="Rage"?" Rage":" skill");
    function effectCharts(effects,opened){
      const details=el("details",undefined,"talent-analysis-effect-charts");details.open=opened===true;
      add(details,el("summary","Compare effects visually"),el("p","Compare the two bars within each card. Each card has its own scale, ending at that component's highest listed rank. These are separate talent modifiers, not final character stats or a score for the build.","small muted"));
      const grid=el("div",undefined,"talent-effect-charts");
      for(const effect of effects){
        // Only analyze()'s exact-text/hash-checked components reach this view.
        // Preserve every component's own units and conditions; never total bars.
        const component=MAPPINGS[effect.talentId]?.components.find(c=>c.metric===effect.metric&&c.unit===effect.unit&&c.scope===effect.scope&&c.condition===effect.condition);
        const maximum=component?Math.max(...component.values):NaN;
        if(!Number.isFinite(maximum)||maximum<=0||![effect.before,effect.after].every(n=>Number.isFinite(n)&&n>=0&&n<=maximum))continue;
        const card=el("article",undefined,"talent-effect-card");card.setAttribute("aria-label",effect.talent+" — "+effect.label);
        add(card,el("h4",effect.talent),el("p",effect.label),el("p","Scale: 0 to "+value(maximum,effect.unit)+" · highest listed rank","talent-effect-scale"));
        for(const [label,n,tone] of [["Comparison",effect.before,"comparison"],["Current",effect.after,"current"]]){
          const row=el("label",undefined,"talent-effect-bar "+tone),meter=el("meter",value(n,effect.unit));meter.min=0;meter.max=maximum;meter.value=n;
          meter.setAttribute("aria-label",effect.talent+" — "+effect.label+", "+label.toLowerCase()+": "+value(n,effect.unit)+" on a 0 to "+value(maximum,effect.unit)+" scale");
          add(row,el("span",label),el("span",value(n,effect.unit),"talent-effect-value"),meter);card.appendChild(row);
        }
        add(card,el("p","Modifier change: "+(effect.delta>0?"+":"")+value(effect.delta,effect.unit==="percent"?"percentage_points":effect.unit),"talent-effect-delta"),el("p",effect.scope+" — "+effect.condition,"small muted"));grid.appendChild(card);
      }
      details.appendChild(grid);return details;
    }
    function render(){if(dead)return null;const opened=new Map(Array.from(body.children).filter(n=>n.tagName==="DETAILS").map(n=>[n.className,n.open===true]));body.replaceChildren();let result;try{result=analyze(data,build,comparison);}catch(error){add(body,el("p",error.message,"err"));return null;}
      // .186: "Compare with no talents" disables itself once used; focus moves to the panel heading (tabindex -1) instead of staying on a disabled control.
      const resetFocused=doc.activeElement===reset;reset.disabled=!comparison;if(resetFocused&&reset.disabled)heading.focus({preventScroll:true});
      add(body,el("p",result.classLabel+" · Current level "+result.current.level+", "+result.current.total+" points · "+(comparison?"Comparison level "+result.before.level+", "+result.before.total+" points":"No-talents comparison at level 60"),"talent-analysis-summary"));
      add(body,el("p","Supported: exact talent-rank comparison. Conditional: the separately listed, source-described modifiers. Unavailable: naked level-60 character stats and final totals.","talent-analysis-status small"));
      const chart=el("div",undefined,"talent-analysis-chart");chart.setAttribute("aria-label","Talent points by tree");result.trees.forEach(tree=>{const row=el("div",undefined,"talent-analysis-tree");add(row,el("strong",tree.name));[["Current",tree.current],["Comparison",tree.before]].forEach(([label,n])=>{const meter=el("meter",n);meter.min=0;meter.max=51;meter.value=n;meter.setAttribute("aria-label",tree.name+" "+label.toLowerCase()+" points");add(row,add(el("label",label+" "+n+" / 51 "),meter));});chart.appendChild(row);});body.appendChild(chart);if(result.coverage.numericMappingsWithheld)add(body,el("p","Some numeric mappings were withheld because the source revision or exact rank text changed. Descriptions remain available.","err"));
      const unavailable=el("details",undefined,"talent-analysis-limits");unavailable.open=opened.get("talent-analysis-limits")===true;add(unavailable,el("summary","Why final character stats are unavailable"),el("p",unavailableReason),el("p","An empty talent allocation is not a measured naked character. No guessed race or base-stat totals are shown."));const missing=el("ul");result.missingMetrics.forEach(text=>missing.appendChild(el("li",text)));unavailable.appendChild(missing);body.appendChild(unavailable);
      add(body,el("h3","Rank changes"),el("p","Each description is the exact selected rank's text. Removed ranks keep their comparison text.","small muted"));
      if(result.changes.length)body.appendChild(table(["Talent / tree","Change","Comparison","Current"],result.changes.map(n=>[n.name+" · "+n.tree,n.change,n.priorRank+" / "+n.maxRank+" — "+n.priorText,n.rank+" / "+n.maxRank+" — "+n.currentText]),"Talent rank changes"));else body.appendChild(el("p","No rank changes between these allocations."));
      const allocation=el("details",undefined,"talent-analysis-selected");allocation.open=opened.get("talent-analysis-selected")===true;add(allocation,el("summary","All selected talent effects"));const selected=result.nodes.filter(n=>n.rank);if(selected.length)allocation.appendChild(table(["Talent / tree","Rank","Exact selected-rank effect","Numeric coverage"],selected.map(n=>[n.name+" · "+n.tree,n.rank+" / "+n.maxRank,n.currentText,n.mappingVerified?"Reviewed components only":n.mappingReason]),"All selected talent effects"));else allocation.appendChild(el("p","No talents allocated."));body.appendChild(allocation);
      add(body,el("h3","Individually quantified components"),el("p","Compare only the same row. Percent changes below describe talent modifiers; they are not final character-stat gains. pp means percentage points. Conditions are not assumed active and rows are never added together.","small muted"));
      if(result.effects.length){body.appendChild(effectCharts(result.effects,opened.get("talent-analysis-effect-charts")));body.appendChild(table(["Talent / component","Comparison","Current","Modifier change","Scope and condition"],result.effects.map(e=>[e.talent+" · "+e.label,value(e.before,e.unit),value(e.after,e.unit),(e.delta>0?"+":"")+value(e.delta,e.unit==="percent"?"percentage_points":e.unit),e.scope+" — "+e.condition+" "+e.note]),"Separate talent modifier components"));}else body.appendChild(el("p","No reviewed numeric components in these allocations. Exact descriptions remain available above."));
      add(body,el("p",result.coverage.selectedTalentsWithNumericComponents+" of "+result.coverage.selectedTalents+" selected talents have reviewed numeric components; "+result.coverage.selectedDescriptionOnly+" are description-only. All "+result.coverage.classes+" classes and "+result.coverage.trees+" trees have exact rank-text comparison; numerical coverage is incomplete.","talent-analysis-coverage small"),el("p","Rank text snapshot "+(result.source.declaredRevision||"unavailable")+"; numeric mappings reviewed for client "+SOURCE.clientBuild+", snapshot "+SOURCE.revision+". Exact mapped rank text and its SHA-256 must match before a numeric component is shown. No current live tuning is claimed.","small muted"));
      const credit=el("p",undefined,"small muted"),link=el("a","Talents Forever");link.href=SOURCE.url;add(credit,el("span","Data: "),link,el("span"," · CC BY 4.0. Blizzard retains its game text and artwork; no publisher endorsement is implied."));body.appendChild(credit);
      return result;
    }
    capture.addEventListener("click",()=>{comparison={className:build.className,level:build.level,ranks:Array.from(build.ranks)};outcome.textContent="Comparison set to the current build.";render();});reset.addEventListener("click",()=>{comparison=null;outcome.textContent="Comparing with no talents at level 60.";render();});
    render();return {update(next,optionalComparison){if(dead)return null;build=next;const before=comparison;if(arguments.length>1)comparison=optionalComparison||null;else if(comparison&&comparison.className!==build.className)comparison=null;if(comparison!==before)outcome.textContent="";return render();},destroy(){if(dead)return;dead=true;section.remove();}};
  }
  return Object.freeze({source:SOURCE,mappings:MAPPINGS,missingMetrics:MISSING,sha256,analyze,mount});
});
