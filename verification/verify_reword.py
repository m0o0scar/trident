from playwright.sync_api import sync_playwright, expect
import os
import urllib.parse
import time
import subprocess

def test_reword():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Larger viewport to see more
        context = browser.new_context(viewport={"width": 1280, "height": 800})
        page = context.new_page()

        # Log console messages
        page.on("console", lambda msg: print(f"PAGE LOG: {msg.text}"))

        try:
            current_dir = os.getcwd()
            # Navigate to History page for the current repo
            encoded_path = urllib.parse.quote(current_dir, safe='')
            # Correct URL path
            url = f"http://localhost:3100/workspace/history?path={encoded_path}"

            print(f"Navigating to {url}")
            page.goto(url)

            # Wait for history header
            page.locator("h1", has_text="History").wait_for(timeout=20000)
            print("History page loaded")

            # Wait for SVG
            page.locator("svg").first.wait_for()

            # Get current branch name
            branch_name = subprocess.check_output(["git", "branch", "--show-current"]).decode().strip()
            print(f"Current branch: {branch_name}")

            # Find the row
            row_selector = "div.flex.items-center.hover\\:bg-base-200"
            branch_row = page.locator(row_selector).filter(has_text=branch_name).first

            branch_row.wait_for()
            print(f"Found row for branch {branch_name}")

            # Right click the row
            print("Right-clicking the commit row...")
            branch_row.click(button="right")

            # Wait for context menu item "Reword commit"
            reword_menu_item = page.locator("text=Reword commit")
            reword_menu_item.wait_for(timeout=5000)
            print("Found 'Reword commit' menu item")

            # Click the menu item
            print("Clicking 'Reword commit'...")
            reword_menu_item.click()

            # Wait for dialog "Reword Commit"
            dialog_header = page.locator("h3", has_text="Reword Commit")
            try:
                dialog_header.wait_for(timeout=5000)
                print("Reword dialog opened")

                # Wait a bit for animations
                time.sleep(1)

                # Take screenshot of the dialog
                screenshot_path = "/home/jules/verification/verification.png"
                page.screenshot(path=screenshot_path)
                print(f"Screenshot saved to {screenshot_path}")

            except Exception as e:
                print("Dialog not found. Checking DOM...")
                dialogs = page.locator("dialog").all()
                print(f"Found {len(dialogs)} dialog elements.")
                for i, d in enumerate(dialogs):
                    print(f"Dialog {i}: visible={d.is_visible()}, class={d.get_attribute('class')}, content={d.inner_text()[:50]}")

                # Also dump full HTML to file
                with open("/home/jules/verification/page_dump.html", "w") as f:
                    f.write(page.content())

                raise e

        except Exception as e:
            print(f"Test failed: {e}")
            page.screenshot(path="/home/jules/verification/failure.png")
            raise e
        finally:
            browser.close()

if __name__ == "__main__":
    test_reword()
