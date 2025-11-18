"use client"; // 必須加這行，因為使用了 useEffect

import { useEffect, useState } from "react";

export default function Page() {
  const [status, setStatus] = useState("Checking...");

  useEffect(() => {
    fetch("/api/line")
      .then((res) => {
        if (res.ok) {
          setStatus("Webhook is running ✅");
        } else {
          setStatus("Webhook error ❌");
        }
      })
      .catch(() => setStatus("Unable to connect ❌"));
  }, []);

  return (
    <main style={{ fontFamily: "sans-serif", padding: "20px" }}>
      <h1>LINE Bot Dashboard</h1>
      <p>Status: {status}</p>
      <p>API Routes:</p>
     
    </main>
  );
}
