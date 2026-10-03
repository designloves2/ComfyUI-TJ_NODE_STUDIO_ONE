// Gallery cards load a server-cached thumbnail; the full-size /view is only the fallback.
export function setThumb(im, img, root = "output") {
  const q = `filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder || "")}`;
  im.loading = "lazy";
  im.decoding = "async";
  im.onerror = () => { im.onerror = null; im.src = `/view?${q}&type=${root}`; };
  im.src = `/tj_shared/thumb?${q}&root=${root}&t=${img.mtime || ""}`;
}
