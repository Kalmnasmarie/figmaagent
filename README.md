# Figma-granskning

Granskar Figma-filer på tre områden och levererar en PDF med skärmdumpar och kommentarer:

- **Designsystem**: färger, kantlinjer, text och effekter ska använda styles eller variabler. Hårdkodade hörnradier och avstånd i auto layout flaggas som förslag.
- **Tillgänglighet**: textkontrast enligt WCAG AA (4,5:1, eller 3:1 för stor text), text under 12 px och för små klickytor (under 24x24 px är fel, under 44x44 px är varning).
- **Struktur**: standardnamn som "Frame 12", grupper som borde vara frames, frames utan auto layout, för djup nästling, tomma och dolda lager samt lager utanför sin förälder.

## Arkitektur

```
src/core/rules.js            Regelmotorn. Samma regler överallt.
src/core/normalize-plugin.js Figma Plugin API  -> gemensamt nodformat
src/core/normalize-rest.js   Figma REST API    -> gemensamt nodformat
src/core/report.js           PDF-rapporten (jsPDF), används av båda
src/plugin/                  Pluginets källkod (sandbox + UI)
plugin/                      Färdigbyggt plugin att importera i Figma
cli/review.js                Granskning via Figma-länk (Claude-vägen)
```

Pluginet och länkvägen läser Figma på olika sätt men gör om noderna till samma format, så reglerna och rapporten finns bara på ett ställe.

## Använd pluginet i Figma

1. Figma desktop: **Plugins > Development > Import plugin from manifest…** och välj `plugin/manifest.json`.
2. Kör **Figma-granskning**. Markera frames och klicka **Granska markering**, eller **Granska hela sidan**.
3. Klicka på en anmärkning för att hoppa till lagret. Filtrera per område och klicka **Ladda ner PDF**.

## Granska via länk

Kräver Node 18+ och en personlig åtkomsttoken från Figma (Settings > Security > Personal access tokens, läsrätt till filer räcker).

```
npm install
FIGMA_TOKEN=... node cli/review.js "https://www.figma.com/design/KEY/Namn?node-id=1-2" --ut rapport.pdf
```

Utan `node-id` granskas alla toppnivå-frames på alla sidor. Begränsa med `--sida "Sidnamn"`.

## Utveckling

```
npm install
npm run build   # bygger plugin/code.js och plugin/ui.html från src/
npm test        # kör pluginet mot en påhittad sida och skapar test/out/exempelrapport.pdf
```

Regler finns i `RULES` i `src/core/rules.js`. Gränsvärden (textstorlek, klickyta, max djup) ändras i `DEFAULT_CONFIG`.

## Nästa steg

- Kommentarer direkt i Figma-filen via REST API (`POST /v1/files/:key/comments` med nodens position) när kommentarskvaliteten är bekräftad.
- Kontroll av att använda variabler och styles kommer från rätt bibliotek.
- Slå ihop flera anmärkningar på samma lager till en post i rapporten.
