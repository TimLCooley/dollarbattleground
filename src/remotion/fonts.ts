import { loadFont as loadRusso } from "@remotion/google-fonts/RussoOne";
import { loadFont as loadChakra } from "@remotion/google-fonts/ChakraPetch";

// The site's fonts (2026-10-21): Russo One for headers and big numbers,
// Chakra Petch for everything else. Loaded once; renders wait for them.
const russo = loadRusso("normal", { weights: ["400"], subsets: ["latin"] });
const chakra = loadChakra("normal", { weights: ["400", "600", "700"], subsets: ["latin"] });

export const HEAD_FONT = `${russo.fontFamily}, 'Arial Black', Arial, sans-serif`;
export const BODY_FONT = `${chakra.fontFamily}, Arial, Helvetica, sans-serif`;
