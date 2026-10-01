"""Build the guild site's game art (worker/public/static/wow/) from textures extracted from the local game client.

The guild site is a free, non-commercial fan site, and like olympus.roachcouncil.com/guild it uses the game's own
interface art: frames, buttons, check boxes, icons, the parchment and the two interface fonts. Nothing here is drawn
or redrawn: every file is a crop, a rearrangement or a format change of one texture, pixel for pixel. No game logo is
used (the loading-screen banner is cropped below the logo).

Input: the folder the extraction wrote (CascLib on the officer's PC, 30 Sep 2026: BLP to PNG with Pillow), with the
client's own paths under it, e.g.  Claude outputs/wow-assets-2026-09-30/Interface/DialogFrame/UI-DialogBox-Border.png

    python tools/build-site-assets.py "<that folder>" worker/public/static/wow

Needs Pillow, fontTools and brotli (pip install pillow fonttools brotli).
"""
import io
import sys
from pathlib import Path

from PIL import Image, ImageChops

SRC = Path(sys.argv[1] if len(sys.argv) > 1 else ".")
OUT = Path(sys.argv[2] if len(sys.argv) > 2 else "worker/public/static/wow")
I = SRC / "Interface"


def load(rel):
    return Image.open(I / rel).convert("RGBA")


def save(img, name, **kw):
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / name
    if name.endswith(".jpg"):
        img.convert("RGB").save(path, "JPEG", quality=kw.get("quality", 82), optimize=True, progressive=True)
    else:
        img.save(path, "PNG", optimize=True)
    return path


def nine_slice(edge_file, cell):
    """A backdrop edge file is eight cells in a row: left, right, top, bottom, then the four corners (TL, TR, BL, BR).
    The top and bottom cells are stored standing up; the game turns them a quarter clockwise when it draws them. This
    lays the same eight cells out as a 3x3 square, the shape CSS border-image reads."""
    src = load(edge_file)
    c = [src.crop((i * cell, 0, i * cell + cell, cell)) for i in range(8)]
    out = Image.new("RGBA", (cell * 3, cell * 3), (0, 0, 0, 0))
    place = {
        (0, 0): c[4], (1, 0): c[2].transpose(Image.Transpose.ROTATE_270), (2, 0): c[5],
        (0, 1): c[0],                                                     (2, 1): c[1],
        (0, 2): c[6], (1, 2): c[3].transpose(Image.Transpose.ROTATE_270), (2, 2): c[7],
    }
    for (x, y), im in place.items():
        out.paste(im, (x * cell, y * cell))
    return out


def additive_to_alpha(img):
    """Textures the game draws with additive blending (highlights) have no alpha: black means 'nothing'. For the web the
    brightness becomes the alpha, so a plain overlay looks the same as the game's ADD blend over a dark button."""
    rgb = img.convert("RGB")
    r, g, b = rgb.split()
    a = Image.eval(Image.merge("RGB", (r, g, b)).convert("L"), lambda v: min(255, v * 2))
    out = rgb.copy()
    out.putalpha(a)
    return out


def main():
    made = []
    # ---- frames (CSS border-image) ----
    made.append(save(nine_slice("DialogFrame/UI-DialogBox-Border.png", 32), "frame-dialog.png"))
    made.append(save(nine_slice("DialogFrame/UI-DialogBox-Gold-Border.png", 32), "frame-gold.png"))
    tooltip = nine_slice("Tooltips/UI-Tooltip-Border.png", 16)
    made.append(save(tooltip, "frame-tooltip.png"))
    # The game colours this border per frame (SetBackdropBorderColor multiplies it); the same, done once here.
    for name, (r, g, b) in (("gold", (0.86, 0.70, 0.34)), ("red", (0.86, 0.22, 0.18)), ("green", (0.30, 0.80, 0.30))):
        rr, gg, bb, aa = tooltip.split()
        tinted = Image.merge("RGBA", (rr.point(lambda v: int(v * r)), gg.point(lambda v: int(v * g)), bb.point(lambda v: int(v * b)), aa))
        made.append(save(tinted, f"frame-tooltip-{name}.png"))
    # The dialog header plaque (the stone bar a window's title sits on), cropped to its own pixels.
    made.append(save(load("DialogFrame/UI-DialogBox-Header.png").crop((118, 3, 393, 79)), "header.png"))
    # ---- buttons: the red panel button, its pressed, greyed and highlight states (the art is the top-left 80x23) ----
    for state in ("Up", "Down", "Disabled"):
        made.append(save(load(f"Buttons/UI-Panel-Button-{state}.png").crop((0, 0, 80, 23)), f"button-{state.lower()}.png"))
    # Hovered: the highlight added onto the button, as the game blends it (ADD), so CSS can simply swap the image.
    up = load("Buttons/UI-Panel-Button-Up.png").crop((0, 0, 80, 23))
    glow = Image.open(I / "Buttons/UI-Panel-Button-Highlight.png").convert("RGB").crop((0, 0, 80, 23))
    lit = ImageChops.add(up.convert("RGB"), glow)
    lit.putalpha(up.getchannel("A"))
    made.append(save(lit, "button-hover.png"))
    # The small red close button, for dialogs.
    for state in ("Up", "Down"):
        made.append(save(load(f"Buttons/UI-Panel-MinimizeButton-{state}.png"), f"close-{state.lower()}.png"))
    made.append(save(additive_to_alpha(Image.open(I / "Buttons/UI-Panel-MinimizeButton-Highlight.png")), "close-highlight.png"))
    # ---- check boxes and radio buttons ----
    for f, name in (("UI-CheckBox-Up", "check-up"), ("UI-CheckBox-Down", "check-down"), ("UI-CheckBox-Check", "check-mark"), ("UI-CheckBox-Check-Disabled", "check-mark-disabled")):
        made.append(save(load(f"Buttons/{f}.png"), f"{name}.png"))
    made.append(save(additive_to_alpha(Image.open(I / "Buttons/UI-CheckBox-Highlight.png")), "check-highlight.png"))
    radio = load("Buttons/UI-RadioButton.png")
    cells = [radio.crop((i * 16, 0, i * 16 + 16, 16)) for i in range(4)]
    made.append(save(cells[0], "radio.png"))
    on = cells[0].copy()
    on.alpha_composite(cells[1])  # the game draws the checked texture over the normal one
    made.append(save(on, "radio-on.png"))
    made.append(save(additive_to_alpha(cells[2].convert("RGB")), "radio-highlight.png"))
    # ---- text boxes: the game's edit box border (the art is the top 128x20) ----
    made.append(save(load("Common/Common-Input-Border.png").crop((0, 0, 128, 20)), "input.png"))
    made.append(save(load("Common/UI-Searchbox-Icon.png"), "search.png"))
    # ---- paper and dividers ----
    made.append(save(Image.open(I / "AchievementFrame/UI-Achievement-Parchment-Horizontal.png"), "parchment.jpg", quality=80))
    made.append(save(load("QuestFrame/UI-HorizontalBreak.png").crop((23, 7, 233, 25)), "divider.png"))
    made.append(save(load("QuestFrame/UI-Quest-BulletPoint.png"), "bullet.png"))
    # ---- backgrounds ----
    made.append(save(Image.open(I / "FrameGeneral/UI-Background-Rock.png"), "rock.jpg", quality=78))
    # Molten Core's loading screen, cropped to the painting between the logo and the bottom border.
    made.append(save(Image.open(I / "Glues/LoadingScreens/LoadScreenMoltenCore.png").crop((6, 124, 506, 408)), "molten-core.jpg", quality=86))
    # ---- icons ----
    roles = load("LFGFrame/UI-LFG-ICON-ROLES.png")
    cell = lambda cx, cy: roles.crop((cx * 67, cy * 67, cx * 67 + 67, cy * 67 + 67))
    for (cx, cy), name in (((0, 1), "role-tank"), ((1, 0), "role-healer"), ((1, 1), "role-dps"), ((2, 1), "role-flex"), ((2, 0), "vote-for"), ((1, 2), "vote-against"), ((0, 0), "role-guide")):
        made.append(save(cell(cx, cy), f"{name}.png"))
    for f, name in (("GroupFrame/UI-Group-LeaderIcon", "leader"), ("GroupFrame/UI-Group-AssistantIcon", "assist"), ("GroupFrame/UI-Group-MasterLooter", "looter"),
                    ("RaidFrame/ReadyCheck-Ready", "ready"), ("RaidFrame/ReadyCheck-NotReady", "not-ready"), ("RaidFrame/ReadyCheck-Waiting", "waiting")):
        made.append(save(load(f + ".png"), f"{name}.png"))
    icons = {
        "class-warrior": "ClassIcon_Warrior", "class-paladin": "ClassIcon_Paladin", "class-hunter": "ClassIcon_Hunter",
        "class-rogue": "ClassIcon_Rogue", "class-priest": "ClassIcon_Priest", "class-shaman": "ClassIcon_Shaman",
        "class-mage": "ClassIcon_Mage", "class-warlock": "ClassIcon_Warlock", "class-druid": "ClassIcon_Druid",
        "pos-guild_master": "INV_Crown_02", "pos-officer": "INV_Crown_01", "pos-raid_leader": "Ability_Warrior_BattleShout",
        "pos-raid_assist": "INV_Misc_GroupNeedMore", "pos-class_lead": "INV_Misc_Book_09", "pos-recruitment": "INV_Letter_15",
        "pos-community": "Achievement_GuildPerk_EverybodysFriend", "pos-pvp_leader": "INV_BannerPVP_02", "pos-loot_council": "INV_Misc_Bag_10",
        "pos-treasurer": "INV_Misc_Coin_01", "pos-professions": "Trade_Engineering", "pos-moderator": "Spell_Holy_SealOfWrath",
        "pos-raider": "INV_Sword_27", "pos-member": "INV_Misc_GroupLooking", "pos-unknown": "INV_Misc_QuestionMark",
        # .44: the three roles added on 30 Sep (a handshake, a map and compass, the Insignia of the Alliance)
        "pos-liaison": "Achievement_Reputation_01", "pos-leveling": "INV_Misc_Map02", "pos-pvp_team": "INV_Jewelry_TrinketPVP_01",
        # .45: the Co-Guild Master (a gold crown, beside the Guild Master's silver one), and Forever's professions
        "pos-co_gm": "INV_Helmet_96",
        "prof-alchemy": "Trade_Alchemy", "prof-blacksmithing": "Trade_BlackSmithing", "prof-enchanting": "Trade_Engraving",
        "prof-engineering": "Trade_Engineering", "prof-herbalism": "Trade_Herbalism", "prof-leatherworking": "Trade_LeatherWorking",
        "prof-mining": "Trade_Mining", "prof-skinning": "INV_Misc_Pelt_Wolf_01", "prof-tailoring": "Trade_Tailoring",
        "prof-cooking": "INV_Misc_Food_15", "prof-first_aid": "Spell_Holy_SealOfSacrifice", "prof-fishing": "Trade_Fishing",
        "icon-apply": "INV_Misc_Note_01", "icon-names": "INV_Scroll_03", "icon-friends": "INV_Banner_02", "icon-clock": "INV_Misc_PocketWatch_01",
        "icon-launch": "Spell_Nature_TimeStop", "icon-warning": "INV_Misc_Head_Dragon_01", "icon-vote": "Spell_Holy_PrayerOfFortitude",
        "icon-shield": "INV_Shield_06", "icon-heal": "Spell_Holy_FlashHeal", "icon-pvp": "Achievement_PVP_A_A",
    }
    for name, f in icons.items():
        made.append(save(load(f"Icons/{f}.png"), f"{name}.png"))
    # ---- fonts: the game's interface fonts, as WOFF2 (same outlines, compressed for the web) ----
    from fontTools.ttLib import TTFont
    for f, name in (("FRIZQT__.TTF", "friz-quadrata.woff2"), ("MORPHEUS.TTF", "morpheus.woff2")):
        t = TTFont(SRC / "Fonts" / f)
        t.flavor = "woff2"
        OUT.mkdir(parents=True, exist_ok=True)
        t.save(OUT / name)
        made.append(OUT / name)
    total = sum(p.stat().st_size for p in made)
    print(f"{len(made)} files, {total / 1024:.0f} KB, in {OUT}")


if __name__ == "__main__":
    main()
