/** Remove only known, fully-tested failed media URLs from user-facing M3U.
 * A favorite remains saved in the user's account; this changes only visibility.
 * Missing/partial health reports never trigger blanket removals.
 */
export function filterVerifiedFailedStreams(m3u, report) {
  if (!report || report.schema!==1 || report.status!=="COMPLETE_HLS" ||
      !Number.isInteger(report.tested) || report.tested<=0 ||
      !Array.isArray(report.hidden_urls)) return String(m3u||"");
  const failed=new Set(report.hidden_urls.filter(url=>typeof url==="string" &&
    /^https:\/\/[^/\s]+\/\S*\.m3u8(?:[?#]\S*)?$/i.test(url)));
  if (!failed.size) return String(m3u||"");
  const lines=String(m3u||"").split(/\r?\n/),out=[];
  let segment=null,hidden=0;
  for(const line of lines) {
    const row=line.trim();
    if(row.startsWith("#EXTINF:")) {
      if(segment)out.push(...segment);
      segment=[line];
      continue;
    }
    if(segment) {
      if(!row || row.startsWith("#")) {
        segment.push(line);
        continue;
      }
      if(failed.has(row)){hidden++;segment=null;}
      else {segment.push(line);out.push(...segment);segment=null;}
      continue;
    }
    out.push(line);
  }
  if(segment)out.push(...segment);
  if(hidden>0)out.push("#DM_HEALTH_HIDDEN:"+hidden);
  return out.join("\n");
}
