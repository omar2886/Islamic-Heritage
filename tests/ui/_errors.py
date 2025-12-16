from __future__ import annotations

from playwright.sync_api import ConsoleMessage, Page


class PageErrorTracker:
    """Collects console and page errors for a Playwright page."""

    def __init__(self, page: Page) -> None:
        self._page = page
        self.page_errors: list[str] = []
        self.console_errors: list[str] = []

        def _on_page_error(exc: Exception) -> None:
            self.page_errors.append(str(exc))

        def _on_console(message: ConsoleMessage) -> None:
            if message.type == "error":
                self.console_errors.append(message.text)

        self._on_page_error = _on_page_error
        self._on_console = _on_console
        self._attached = True

        page.on("pageerror", self._on_page_error)
        page.on("console", self._on_console)

    def __enter__(self) -> "PageErrorTracker":
        return self

    def __exit__(self, exc_type, exc, tb) -> bool:
        self.detach()
        if exc_type is None:
            self._raise_if_errors()
        return False

    def detach(self) -> None:
        if not self._attached:
            return
        self._page.off("pageerror", self._on_page_error)
        self._page.off("console", self._on_console)
        self._attached = False

    def assert_no_errors(self) -> None:
        self.detach()
        self._raise_if_errors()

    def _raise_if_errors(self) -> None:
        assert not self.page_errors, f"Page errors detected: {'; '.join(self.page_errors)}"
        assert not self.console_errors, f"Console errors detected: {'; '.join(self.console_errors)}"
