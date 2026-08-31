import sys

file_path = "mobile/app/(auth)/register.tsx"
with open(file_path, "r", encoding="utf-8") as f:
    text = f.read()

text = text.replace(
    """<Button 
                title={isVerifying ? "Verifying..." : "Verify OTP"} 
                onPress={handleVerifyOtp} 
                isLoading={isVerifying}
                disabled={otp.length !== 6 || isVerifying}
              />""",
    """<Button 
                onPress={handleVerifyOtp} 
                isLoading={isVerifying}
                disabled={otp.length !== 6 || isVerifying}
              >{isVerifying ? "Verifying..." : "Verify OTP"}</Button>"""
)
text = text.replace(
    """<Button 
              title={isRegistering ? "Creating account..." : "Create Account"} 
              onPress={handleRegister} 
              isLoading={isRegistering}
              disabled={isRegistering}
              className="mt-2 shadow-md shadow-ess-purple/20"
            />""",
    """<Button 
              onPress={handleRegister} 
              isLoading={isRegistering}
              disabled={isRegistering}
              className="mt-2 shadow-md shadow-ess-purple/20"
            >{isRegistering ? "Creating account..." : "Create Account"}</Button>"""
)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(text)
print("SUCCESS")
