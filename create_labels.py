import pandas as pd

# Load the processed dataset
df = pd.read_csv("train_processed.csv")

# Cap RUL at 125 for model training
RUL_CAP = 125
df["RUL"] = df["RUL"].clip(upper=RUL_CAP)


# Create health classes
def create_health_class(rul):
    if rul > 50:
        return "Healthy"
    elif rul > 20:
        return "Warning"
    else:
        return "Critical"


df["health"] = df["RUL"].apply(create_health_class)


# Show the distribution
print("\nHealth class distribution:")
print(df["health"].value_counts())


# Save the labelled dataset
df.to_csv("train_processed.csv", index=False)

print("\nHealth labels created successfully!")
print("Saved: train_processed.csv")