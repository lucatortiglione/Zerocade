import type { GameInstance } from './engine'
import { drawAvatar } from './avatar'
import { addPoints, drawLeaderboard } from './common'

// "Word Swipe" — like Zen Word / Words of Wonder: a wheel of letters, viewers type
// any word they can build from them in chat. Longer words score more.

const PUZZLES = [
  'STREAM', 'PLANET', 'GARDEN', 'SILENT', 'MARKET', 'CORNER', 'BRIDGE',
  'FLOWER', 'TRAVEL', 'WONDER', 'POCKET', 'SHIELD', 'BOTTLE', 'ROCKET',
  'CASTLE', 'DRAGON',
]

const WORDS_A = `
ant ape arc are arm art ash ask ate awe axe bad bag ban bar bat bay bed bee beg bet bid big bin bit bow box boy bud bug bun bus but buy cab can cap car cat cob cod con cop cot cow cry cub cue cup cut dad dam day den dew did die dig dim din dip dog dot dry dub due dug dye ear eat ebb eel egg elf elm end era eve fan far fat fed fee few fig fin fir fit fix fly fog for fox fry fun fur gap gas gel gem get gin god got gum gun gut had ham has hat hay hen her him hip his hit hog hop hot how hub hue hug hum hut ice icy ill imp ink inn ion its jab jam jar jaw jet jig job jog jot joy jug key kid kin kit lab lad lag lap law lay led leg let lid lie lip lit log lot low mad man map mat may men met mix mob mop mud mug nap net new nib nil nip nit nod nor not now nun nut oak oar oat odd oil old one opt orb ore our out owe owl own pad pal pan pat paw pay pea peg pen per pet pie pig pin pit pod pop pot pro pub pun pup put rag ram ran rap rat raw ray red rib rid rig rim rip rob rod roe rot row rub rug rum run rut sad sag sap sat saw say sea see set sew she sin sip sir sit six ski sky sob sod son sop sow soy spa spy sub sum sun tab tag tan tap tar tax tea ten the tic tie tin tip toe ton too top tot tow toy try tub tug two urn use van vat vet via vie vow wag war was wax way web wed wet who why wig win wit woe wok won woo wow yak yam yap yaw yes yet you zap zen zig zip zit zoo able acid aged ages aims airs alas ally also arch area arms army arts atom aunt auto away baby back bags bail bait bake bald ball band bang bank bard bare bark barn base bath bats bead beam bean bear beat beds been beer bees bell belt bend bent best bike bill bind bird bite bits blue boat body boil bold bolt bomb bond bone book boom boot bore born boss both bowl brew brim brow bulb bulk bull bump burn bush busy cake calf call calm came camp cane cans cape caps card care cars cart case cash cast cats cave cell cent chat chef chin chip chop cite city clad clam clan clap claw clay clip clog club clue coal coat code coil coin cold colt comb come cone cook cool cope copy cord core cork corn cost cozy crab cram crew crop crow cube cult curb cure curl cute
`
const WORDS_B = `
dairy dale dame damp dare dark dart dash data date dawn dead deaf deal dear debt deck deed deem deep deer dent deny desk dial dice diet dime dine ding dips dire dirt dish disk dive dock does dole doll dome done doom door dope dose dote dots dove down doze drag draw drew drip drop drum dual duck duct dude duel dues duet duke dull dumb dump dune dunk dusk dust duty each earl earn ears ease east easy eats echo edge edit eels else emit ends envy epic eras even ever evil exam exit face fact fade fail fair fake fall fame fang fans fare farm fast fate fawn fear feat feed feel feet fell felt fern file fill film find fine fins fire firm fish fist fits five flag flap flat flaw flea fled flee flew flip flit floe flow flux foal foam foil fold folk fond font food fool foot ford fore fork form fort foul four fowl free fret frog from fuel full fund fury fuse fuss gain gait gale game gang gape gaps garb gash gasp gate gave gaze gear gene gens gent gets gift gild gill gilt gird girl gist give glad glee glen glib glob glow glue glut gnat gnaw goad goal goat goes gold golf gone gong good gore gory gout gown grab gram gray grew grid grim grin grip grit grow grub gulf gull gulp gush gust guts hack hail hair hale half hall halt hand hang hare hark harm harp hash hate haul have hawk haze head heal heap hear heat heed heel heir held hell helm help hemp herb herd here hero hers hide high hike hill hilt hind hint hire hiss hive hoax hold hole holy home hone hood hoof hook hoop hoot hope horn hose host hour hove howl huge hull hump hung hunt hurl hurt hush iced ices idea idle idol inch into iron isle item jade jail jams jars jaws jazz jean jest jets jibe jigs jilt jive jobs jock joke jolt jowl joys judo jury just keen keep kept kick kids kill kiln kind king kiss kite kiwi knee knew knit knob knot know lace lack lads lady laid lain lair lake lamb lame lamp land lane lard lark lash lass last late lava lawn laws lazy lead leaf leak lean leap left lend lens lent less liar lice lick lids lied lien lies life lift like limb lime limn limp line link lint lion lips lira lire list live load loaf loam loan lobe lock loft logo loin lone long look loom loop loot lord lore lose loss lost loud love lows luck lull lump lung lure lush lust lute made maid mail main make male mall malt mane many mare mark mars mart mash mask mass mast mate math mats maul maze mead
`
const WORDS_C = `
meal mean meat meek meet melt mend menu mere mesh mess mice mild mile milk mill mime mind mine mint mire miss mist mite mitt moan moat mock mode mold mole molt monk mood moon moor moot more moss most moth move mows much muck muff mule mull muse mush musk must mute mutt myth nail name nape naps navy near neat neck need nest nets news next nice nick nigh nine node nods noel none nook noon norm nose note noun nude numb oaks oats obey odds ogre oils oily okay olds omen omit once ones only onto onus ooze open oral orbs ores oven over owes owls owns pace pack pact pads page paid pail pain pair pale palm pane pans pant park part pass past path pave paws pays peak peal pear peas peat peck peek peel peep peer pelt pens pent perk pert pest pets pick pier pies pike pile pill pimp pine ping pink pins pint pipe pits plan play plea pled plot plow ploy plug plum plus poem poet poke pole poll polo pond pone pons pony pool poor pore pork port pose post pots pour pout pram pray prep prey prim prod prom prop prow pubs puff pull pulp pump puns punt pure purr push puts quay quit quiz race rack raft rage rags raid rail rain rake ramp rams rang rank rant rape rapt rare rash rasp rate rave rays read real ream reap rear redo reed reef reek reel rein rely rend rent rest rice rich rick ride rids rift rigs rind ring rink riot ripe rise risk rite road roam roan roar robe rock rode rods roes role roll romp roof rook room root rope rose rosy rote rots rout rove rows ruby rude rued rues ruin rule rump rung runs runt ruse rush rust ruts sack safe saga sage said sail sake sale salt same sand sane sang sank saps sash sate save sawn says scam scan scar seal seam sear seas seat sect seed seek seem seen seep sees sell semi send sent sera sets shag sham shed shin ship shoe shop shot show shut sick side sift sigh sign silk sill silo silt sine sing sink sins sire site sits size skew skid skim skin skip skis skit slab slag slam slap slat slaw slay sled slew slid slim slip slit slob sloe slog slop slot slow slug slum slur slut smog smug snag snap snip snob snot snow snub snug soak soap soar sock soda sofa soft soil sold sole solo some song soon soot sore sort soul soup sour sown span spar spas spat spec sped spin spit spot spry spun spur stab stag star stay stem step stew stir stop stow stub stud stun such sued sues suit sulk sums sung sunk suns sure surf swab swam swan swap swat sway swim tabs tack tact tags tail take tale talk tall tame tang tank tape taps tare tarn tarp tart task taut taxi teal team tear teas teat tech teem teen tell temp tend tens tent term test text than that thaw thee them then they thin this thus tick tide tidy tied tier ties tile till tilt time tine ting tint tiny tips tire toad toed toes tofu toga toil told toll tomb tone tong tons took tool toot tore torn tort toss tote tour tout town toys tram trap tray tree trek trim trio trip trod trot true tuba tube tuck tuft tuna tune turn tusk tutu twin twig twit type ugly undo unit unto upon urge used user uses vain vale vane vase vast veal veer veil vein vent verb very vest veto vial vice view vile vine viol visa vise void volt vote vows wade wads waft wage wags wail wait wake walk wall wand wane want ward ware warm warn warp wars wart wary wash wasp watt wave wavy waxy ways weak weal wean wear webs weds weed week weep weld well welt went wept were west wham what when whet whim whip whir whiz whom wick wide wife wild will wilt wily wind wine wing wink wins wipe wire wise wish wisp with wits woad woes woke wolf womb wont wood woof wool word wore work worm worn wove wrap wren writ yank yard yarn yawn yeah year yell yelp yeti yoga yoke yolk yore your zany zeal zero zest zinc zing zone zoom
`

const DICT = new Set([...WORDS_A.split(/\s+/), ...WORDS_B.split(/\s+/), ...WORDS_C.split(/\s+/)])

const pointsFor = (len: number) => (len < 4 ? 1 : len - 2) + (len >= 6 ? 3 : 0)

const canForm = (word: string, letters: string): boolean => {
  const avail: Record<string, number> = {}
  for (const c of letters) avail[c] = (avail[c] ?? 0) + 1
  for (const c of word) {
    if (!avail[c]) return false
    avail[c]--
  }
  return true
}

const scramble = (s: string): string => {
  const a = s.split('')
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a.join('')
}

export function createWordSwipe(): GameInstance {
  let width = 0
  let height = 0
  let seconds = 60
  let timer = 60
  let letters = ''
  let answers: string[] = []
  let found = new Set<string>()
  let revealed = false
  let flash = 0
  let lastFound: { word: string; name: string; pts: number; avatar?: string } | null = null
  const scores = new Map<string, { name: string; pts: number; avatar?: string }>()

  const newRound = () => {
    const base = PUZZLES[Math.floor(Math.random() * PUZZLES.length)]
    letters = scramble(base)
    answers = [...DICT]
      .filter((w) => w.length >= 3 && canForm(w, base))
      .sort((a, b) => b.length - a.length || a.localeCompare(b))
    found = new Set()
    revealed = false
    flash = 0
    lastFound = null
    timer = seconds
  }


  return {
    reset(settings, w, h) {
      width = w
      height = h
      seconds = typeof settings.seconds === 'number' ? settings.seconds : 60
      scores.clear()
      newRound()
    },
    onAction(_action, event) {
      if (event.type !== 'comment' || revealed) return
      const word = event.text.toUpperCase().replace(/[^A-Z]/g, '')
      if (word.length < 3 || found.has(word) || !DICT.has(word) || !canForm(word, letters)) return
      found.add(word)
      const pts = pointsFor(word.length)
      addPoints(scores, event.user.id, event.user.nickname, event.user.avatar, pts)
      lastFound = { word, name: event.user.nickname, pts, avatar: event.user.avatar }
      flash = 2.5
    },
    update(dt, _now, settings) {
      seconds = typeof settings.seconds === 'number' ? settings.seconds : seconds
      timer -= dt
      flash = Math.max(0, flash - dt)
      if (timer <= 0) {
        if (revealed) newRound()
        else {
          revealed = true
          timer = 7
        }
      }
    },
    draw(ctx) {
      ctx.clearRect(0, 0, width, height)
      const cx = width / 2

      ctx.textAlign = 'center'
      ctx.fillStyle = '#ffffff'
      ctx.font = 'bold 44px system-ui'
      ctx.fillText('WORD SWIPE', cx, 84)
      ctx.fillStyle = '#8a8a96'
      ctx.font = '22px system-ui'
      ctx.fillText('Type any word from the letters', cx, 122)

      const n = letters.length
      const R = Math.min(width * 0.3, 150)
      const cy = height * 0.33
      letters.split('').forEach((ch, i) => {
        const a = -Math.PI / 2 + i * ((2 * Math.PI) / n)
        const x = cx + Math.cos(a) * R
        const y = cy + Math.sin(a) * R
        ctx.fillStyle = '#1b1b21'
        ctx.beginPath()
        ctx.arc(x, y, 42, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = '#3ccf7a'
        ctx.lineWidth = 2
        ctx.stroke()
        ctx.fillStyle = '#ffffff'
        ctx.font = 'bold 40px system-ui'
        ctx.textBaseline = 'middle'
        ctx.fillText(ch, x, y + 2)
      })
      ctx.textBaseline = 'alphabetic'

      if (flash > 0 && lastFound) {
        const text = `${lastFound.name} +${lastFound.pts} — ${lastFound.word}`
        ctx.font = 'bold 28px system-ui'
        const tw = ctx.measureText(text).width
        const pw = tw + 96
        const px = cx - pw / 2
        const py = height * 0.44
        ctx.fillStyle = '#1b1b21ee'
        ctx.beginPath()
        ctx.roundRect(px, py - 26, pw, 52, 26)
        ctx.fill()
        drawAvatar(ctx, lastFound.avatar, px + 38, py, 22, lastFound.name)
        ctx.fillStyle = '#3ccf7a'
        ctx.textAlign = 'left'
        ctx.fillText(text, px + 70, py + 9)
        ctx.textAlign = 'center'
      }

      ctx.fillStyle = '#f5b14c'
      ctx.font = 'bold 28px system-ui'
      ctx.fillText(`Found ${found.size} / ${answers.length}`, cx, height * 0.5)

      const list = revealed ? answers : [...found].sort((a, b) => b.length - a.length)
      const cols = 4
      const cellW = width / cols
      const startY = height * 0.55
      list.slice(0, 24).forEach((w, i) => {
        const x = (i % cols) * cellW + cellW / 2
        const y = startY + Math.floor(i / cols) * 44
        const isFound = found.has(w)
        ctx.fillStyle = isFound ? '#3ccf7a' : '#2a2a33'
        ctx.beginPath()
        ctx.roundRect(x - cellW / 2 + 8, y - 20, cellW - 16, 36, 8)
        ctx.fill()
        ctx.fillStyle = isFound ? '#ffffff' : '#8a8a96'
        ctx.font = '20px system-ui'
        ctx.fillText(w, x, y + 5)
      })

      const frac = Math.max(0, timer / (revealed ? 7 : seconds))
      ctx.fillStyle = '#00000055'
      ctx.fillRect(40, height - 56, width - 80, 14)
      ctx.fillStyle = revealed ? '#3ccf7a' : '#f5b14c'
      ctx.fillRect(40, height - 56, (width - 80) * frac, 14)

      drawLeaderboard(ctx, scores)
    },
  }
}