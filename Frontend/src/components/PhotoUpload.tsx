import { useRef, useState } from "react";
import { Camera } from "lucide-react";
import { api } from "../api";
import { Button, Modal } from "./Common";
export function PhotoUpload({
  photo,
  changed,
}: {
  photo: string | null;
  changed: (url: string) => void;
}) {
  const [source, setSource] = useState("");
  const [zoom, setZoom] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const image = useRef<HTMLImageElement>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  async function save() {
    if (!image.current) return;
    setBusy(true);
    setError("");
    try {
      const im = image.current;
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 640;
      const side = Math.min(im.naturalWidth, im.naturalHeight) / zoom;
      canvas
        .getContext("2d")!
        .drawImage(
          im,
          (im.naturalWidth - side) / 2,
          (im.naturalHeight - side) / 2,
          side,
          side,
          0,
          0,
          640,
          640,
        );
      const blob = await new Promise<Blob>((resolve) =>
        canvas.toBlob((b) => resolve(b!), "image/jpeg", 0.9),
      );
      const body = new FormData();
      body.append("image", blob, "profile.jpg");
      const r = await api<{ photo: string }>("/uploads/photo", {
        method: "POST",
        body,
      });
      changed(r.photo);
      URL.revokeObjectURL(source);
      setSource("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="photo-upload">
      {photo && <img src={photo} alt="Your profile preview" />}
      <label className="upload-button">
        <Camera size={18} />
        {photo ? "Replace photo" : "Upload a profile photo"}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            if (file.size > 5 * 1024 * 1024) {
              setError("Choose an image smaller than 5 MB.");
              return;
            }
            setSource(URL.createObjectURL(file));
            setZoom(1);
          }}
        />
      </label>
      {photo && (
        <Button variant="outline" onClick={() => setConfirmDelete(true)}>
          Delete photo
        </Button>
      )}
      <p className="muted">JPG, PNG or WebP · up to 5 MB</p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {source && (
        <Modal
          title="Crop your photo"
          description="Adjust the zoom to frame yourself in the center."
          close={() => {
            URL.revokeObjectURL(source);
            setSource("");
          }}
        >
          <div className="crop-preview">
            <img
              ref={image}
              src={source}
              alt="Crop preview"
              style={{ transform: `scale(${zoom})` }}
            />
          </div>
          <label>
            Zoom
            <input
              type="range"
              min="1"
              max="3"
              step="0.05"
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
            />
          </label>
          <Button disabled={busy} onClick={() => void save()}>
            {busy ? "Uploading…" : "Save photo"}
          </Button>
        </Modal>
      )}
      {confirmDelete && (
        <Modal
          title="Delete your profile photo?"
          description="You’ll need to add a new photo to complete your profile and appear in discovery again."
          close={() => setConfirmDelete(false)}
        >
          <Button
            className="danger"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api("/uploads/photo", { method: "DELETE" });
                changed("");
                setConfirmDelete(false);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Delete photo
          </Button>
        </Modal>
      )}
    </div>
  );
}
