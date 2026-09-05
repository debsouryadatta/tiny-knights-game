// Application round-trip time, including subscription processing, not ICMP ping.
// Only one read-only probe can be outstanding; every probe is unsubscribed.
export function createPingMonitor({probe,onUpdate,intervalMs=3000,timeoutMs=3000}) {
  let stopped=false,timer,deadline,cancel;
  function run(){
    if(stopped)return;
    const started=performance.now();let finished=false;
    const finish=(state)=>{
      if(stopped||finished)return;
      finished=true;clearTimeout(deadline);cancel?.();cancel=undefined;
      onUpdate(state);
      timer=setTimeout(run,intervalMs);
    };
    deadline=setTimeout(()=>finish({state:'timeout',ms:null}),timeoutMs);
    try{
      const cleanup=probe(()=>finish({state:'ready',ms:Math.max(1,Math.round(performance.now()-started))}),()=>finish({state:'unavailable',ms:null}));
      if(finished)cleanup?.();else cancel=cleanup;
    }catch{finish({state:'unavailable',ms:null});}
  }
  onUpdate({state:'measuring',ms:null});
  run();
  return ()=>{stopped=true;clearTimeout(timer);clearTimeout(deadline);cancel?.();cancel=undefined;};
}
