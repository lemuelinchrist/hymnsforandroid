import os

# Directory containing the SVG files
directory = r"C:\dev\hymnsforandroid\app\src\pianoSvg"

# Loop through the numbers 1001 to 1086
for i in range(1001, 1087):
  old_name = f"NS{i}.svg"
  num_part = str(i)[1:]  # remove the first digit (the '1' in 1001)
  new_name = f"NS10{num_part}.svg"

  old_path = os.path.join(directory, old_name)
  new_path = os.path.join(directory, new_name)

  if os.path.exists(old_path):
    os.rename(old_path, new_path)
    print(f"Renamed {old_name} to {new_name}")
  else:
    print(f"{old_name} not found, skipping.")
