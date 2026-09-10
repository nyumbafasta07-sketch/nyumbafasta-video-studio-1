import Link from "next/link";

export default function NotFound() {
  return (
    <div style={{ maxWidth: 480, margin: "14vh auto", padding: "0 20px" }}>
      <h2>Not found</h2>
      <p className="muted">That page or resource does not exist.</p>
      <p>
        <Link href="/">← Dashboard</Link>
      </p>
    </div>
  );
}
