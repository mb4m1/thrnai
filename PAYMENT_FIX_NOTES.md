# Payment checkout currency

Razorpay checkout currency must be derived from the displayed price in the same pricing card because the button label is only `Choose Pro` / `Choose Business`.

The Worker injection now reads `.price-card .price-value` and detects `₹` or `$`, falling back to the stored currency only when the displayed price cannot be determined.
