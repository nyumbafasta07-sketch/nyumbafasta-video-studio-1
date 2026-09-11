import Link from "next/link";

export default function NotFound() {
  return (
    <div className="auth">
      <div className="box" style={{ textAlign: "center" }}>
        <h2 style={{ marginBottom: 6 }}>Not found</h2>
        <p className="muted">That page or resource does not exist.</p>
        <Link href="/" className="btn" style={{ marginTop: 14 }}>← Dashboard</Link>
      </div>
    </div>
  );
}
