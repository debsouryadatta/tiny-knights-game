"""Extract the first variation from the owner's 24-second source sequences.
Usage: python3 scripts/prepare-audio.py /path/to/Helton\ Yan\'s\ Pixel\ Combat
Requires Python <=3.12 (stdlib audioop).
"""
import audioop
import pathlib
import sys
import wave
cuts = {
 'FEETMisc_STEP-Boots on Grass_HY_PC.wav':(.60,1.03),
 'DSGNMisc_MELEE-Sword Slash_HY_PC.wav':(.48,1.15),
 'WHSH_MOVEMENT-Wind Sweep Swish_HY_PC.wav':(.60,2.1),
 'DSGNSynth_BUFF-Water Buff_HY_PC.wav':(.48,1.1),
 'DSGNImpt_EXPLOSION-Sand Impact_HY_PC.wav':(.48,1.8),
 'DSGNTonl_USABLE-Whimsy Coin_HY_PC.wav':(.48,1.5),
 'SWSH_MOVEMENT-Tiny Chime_HY_PC.wav':(.48,1.45),
}
destination=pathlib.Path(__file__).resolve().parents[1]/'public/assets/audio'
destination.mkdir(parents=True,exist_ok=True)
for name,(start,end) in cuts.items():
 with wave.open(str(pathlib.Path(sys.argv[1])/name)) as source:
  rate=source.getframerate();source.setpos(int(start*rate))
  data=audioop.lin2lin(source.readframes(int((end-start)*rate)),source.getsampwidth(),2)
  if source.getnchannels()==2:data=audioop.tomono(data,2,.5,.5)
  data,_=audioop.ratecv(data,2,1,rate,44100,None)
  # Tiny fade at either end prevents discontinuities at cut boundaries.
  import array
  samples=array.array('h',data);fade=220
  for i in range(min(fade,len(samples)//2)):
   samples[i]=int(samples[i]*i/fade);samples[-1-i]=int(samples[-1-i]*i/fade)
  with wave.open(str(destination/name),'wb') as out:
   out.setnchannels(1);out.setsampwidth(2);out.setframerate(44100);out.writeframes(samples.tobytes())
