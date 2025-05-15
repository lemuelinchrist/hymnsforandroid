import os

def rename_svg_files(directory):
  """
  Renames files from NS1001.svg → NS10001.svg
  by inserting a zero after the 'NS1' prefix.

  Parameters:
      directory (str): Path to the folder containing the SVG files.
  """
  for i in range(1001, 1087):
    old_name = f"NS{i}.svg"
    num_part = str(i)[1:]  # Strip the first digit
    new_name = f"NS10{num_part}.svg"

    old_path = os.path.join(directory, old_name)
    new_path = os.path.join(directory, new_name)

    if os.path.exists(old_path):
      os.rename(old_path, new_path)
      print(f"Renamed {old_name} to {new_name}")
    else:
      print(f"{old_name} not found, skipping.")

# Example usage:
if __name__ == "__main__":
  target_dir = r"C:\dev\hymnsforandroid\app\src\pianoSvg"
  rename_svg_files(target_dir)
  target_dir = r"C:\dev\hymnsforandroid\app\src\guitarSvg"
  rename_svg_files(target_dir)
