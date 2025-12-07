import { PublicKey, clusterApiUrl } from "@solana/web3.js";

import agateImage from "./assets/agate.png";
import jadeImage from "./assets/jade.png";
import topazImage from "./assets/topaz.png";
import quartzImage from "./assets/quartz.png";
import sapphireImage from "./assets/sapphire.png";
import amazoniteImage from "./assets/amazonite.png";
import rubyImage from "./assets/ruby.png";

const CLUSTER = "devnet";

export const ENDPOINT = clusterApiUrl(CLUSTER);
export const PROGRAM_ID = new PublicKey("2Wr2VbaMpGA5cLJrdpcHQpRmXtbdyypMoa9VzMuAhV3A");
export const TOKEN_METADATA_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");

export const STONES = {
    Agate: agateImage,
    Sapphire: sapphireImage,
    Ruby: rubyImage,
    Quartz: quartzImage,
    Amazonite: amazoniteImage,
    Jade: jadeImage,
    Topaz: topazImage,
};
