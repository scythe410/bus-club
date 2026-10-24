# Nil Kirilli / Blue Chick 02 model adaptation

Reference search requested by the user: Google Images, “nil kirilli”. Three agents
split front/cab, side/rear, and model geometry analysis. The interior was added
following the user's follow-up request.

## Sources inspected

- Main bright-blue front three-quarter photograph:
  https://www.facebook.com/100071522951157/photos/614180290976064/
- Side/rear reference search:
  https://www.google.com/search?q=nil+kirilli+bus+side+rear&udm=2
- Rear photograph with six lamps, right-hand ladder and ND 4138 plate:
  https://www.facebook.com/malindudananjay/posts/nil-kirilligalle-bus-picaso-like-page-ekata-like-ekak-dannaloku-udauwak-sup-ekak/544349626082819/
- Interior thumbnails found in Google Images:
  https://www.youtube.com/watch?v=6J8mED01WyI
  https://www.youtube.com/watch?v=5qqagx0Oh44

## Observed and represented

Sky/cobalt blue Ashok Leyland body; silver/cyan sweeping murals; outlined lettering;
large roof destination pod; four central roof lamps; little blue markers; gold/chrome
mirror brackets; four round front lamps in paired rectangular housings; central
chrome grille and side vents; bumper insets. Dark sliding windows with chrome trim.
Rear ladder, six rectangular lamp bank, low decorated mudflap and chrome bumper
rails. The rear ladder is on the viewer's right when standing behind the bus.

Interior references show 2+2 blue high-back seats, patterned pale-blue backs,
navy pleated curtains and white scalloped valances, chrome overhead racks with
repeated circular decoration, blue/pink/green strips and white roof lights, chrome
rails and three front overhead speakers. Front photos show colorful dashboard
cushions. These replace the source model's simple seats.

## Interpretation and limits

Search results include several revisions and similarly named buses. The model
uses the bright-blue Blue Chick 02 vocabulary; spoiler and equipment are touring
interpretations where photographs differ. This is not a photogrammetric replica.
Exact hidden roof equipment, opposite door placement, seat count, seat printing,
lettering flourishes and dashboard manufacturing detail cannot be established
from the available thumbnails. The existing licensed body/door/wheel geometry
remains the foundation.

The blue bird/feather/portrait mural is **new AI-generated artwork** made with the
imagegen skill to evoke the observed airbrushed blue style; it is not a tracing or
an exact copy of the reference paintwork. Sinhala uses the existing bundled font.
The generated JPEG is served locally and repainted into the existing UV atlas.
If this texture fails to load, a blue procedural mural still renders.

Geometry is batched by material. Interior geometry is 24,420 triangles and 13
batches; touring ornament adds about 24,020 triangles and 9 batches. Source model
textures and generated signage textures are shared among convoy clones; per-bus
materials, wheels and editable signs retain independent state.

## Verification

Production build and Node tests, including new geometry envelope, cabin budget and
four-camera-cycle checks. Final visual inspection in the local model review confirmed
front proportions, open windows, passenger aisle, lights and driver sightline.

Final cabin screenshot: `review/nil-kirilli-cabin.png`. Seat headrests reuse the
original generated blue-bird artwork. The model review renders on view changes
rather than running an idle animation loop.
