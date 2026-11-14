import Foundation
import Vision
import AppKit
var out:[String:[[String:Any]]]=[:]
for path in CommandLine.arguments.dropFirst() {
  guard let img=NSImage(contentsOfFile:path), let cg=img.cgImage(forProposedRect:nil,context:nil,hints:nil) else {continue}
  let req=VNRecognizeTextRequest()
  req.recognitionLanguages=["ja-JP","en-US"]; req.recognitionLevel = .accurate; req.usesLanguageCorrection=false
  try? VNImageRequestHandler(cgImage:cg).perform([req])
  var arr:[[String:Any]]=[]
  for o in req.results ?? [] { let b=o.boundingBox
    arr.append(["t":o.topCandidates(1).first?.string ?? "","x":b.minX,"y":1-b.maxY,"w":b.width,"h":b.height]) }
  out[path]=arr
}
let d=try! JSONSerialization.data(withJSONObject:out)
FileHandle.standardOutput.write(d)
print("")
