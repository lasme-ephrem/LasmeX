from __future__ import annotations


class LasmeXError(Exception):
    """Base exception for SDK and runtime failures."""


class TransportClosedError(LasmeXError):
    """Raised when the runtime subprocess exits or closes stdout."""


class SdkProtocolError(LasmeXError):
    """Raised when the runtime sends data outside the SDK protocol."""


class JsonRpcError(LasmeXError):
    """Raised when the runtime returns a JSON-RPC error response."""

    def __init__(self, code: int | None, message: str, data: object | None = None) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.data = data
