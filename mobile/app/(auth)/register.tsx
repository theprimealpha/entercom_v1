import React, { useState } from 'react';
import { View, Text, Alert, ScrollView, Image, KeyboardAvoidingView, Platform } from 'react-native';
import { Link, router } from 'expo-router';
import { authApi } from '../../src/api/auth';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Input } from '../../src/components/ui/Input';
import { Button } from '../../src/components/ui/Button';
import { Alert as CustomAlert } from '../../src/components/ui/Alert';

export default function RegisterScreen() {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [showOtp, setShowOtp] = useState(false);
  const [otp, setOtp] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const handleRegister = async () => {
    setRegisterError(null);
    setSuccessMsg(null);
    if (!email || !password || !firstName || !lastName) {
      setRegisterError('Please fill in all required fields');
      return;
    }

    try {
      setIsLoading(true);
      const payload: Record<string, string> = { email, password, first_name: firstName, last_name: lastName };
      if (phone) payload.phone_number = phone;
      await authApi.register(payload);
      setSuccessMsg('Registration successful. Please verify your email.');
      setShowOtp(true);
    } catch (error: any) {
      setRegisterError(error?.message || 'Something went wrong');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    setRegisterError(null);
    setIsVerifying(true);
    try {
      await authApi.verifyEmail(otp);
      setSuccessMsg('Email verified successfully!');
      setTimeout(() => {
        router.replace('/(auth)/login');
      }, 1500);
    } catch (error: any) {
      setRegisterError(error?.message || 'Invalid OTP. Please try again.');
    } finally {
      setIsVerifying(false);
    }
  };

  if (showOtp) {
    return (
      <SafeAreaView className="flex-1 bg-white relative">
        <View className="absolute top-0 left-0 w-full h-[300px] bg-ess-softBlue rounded-b-[60px]" />
        
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
          className="flex-1"
        >
          <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 32 }} showsVerticalScrollIndicator={false}>
            <View className="mb-10 items-center mt-10">
              <Text className="text-3xl font-bold text-ess-darkPurple mb-2 text-center">Verify Email</Text>
              <Text className="text-[15px] text-gray-500 text-center">
                We've sent a 6-digit OTP to your email.
              </Text>
            </View>

            {registerError && (
              <CustomAlert type="error" title="Error" description={registerError} className="mb-6" />
            )}
            
            {successMsg && (
              <CustomAlert type="success" title="Success" description={successMsg} className="mb-6" />
            )}

            <View className="space-y-4">
              <Input
                label="OTP Code"
                placeholder="Enter 6-digit OTP"
                value={otp}
                onChangeText={setOtp}
                keyboardType="number-pad"
                maxLength={6}
              />
              <Button 
                onPress={handleVerifyOtp} 
                isLoading={isVerifying}
                disabled={otp.length !== 6 || isVerifying}
              >{isVerifying ? "Verifying..." : "Verify OTP"}</Button>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white relative">
      {/* Premium Background Elements */}
      <View className="absolute top-0 left-0 w-full h-[300px] bg-ess-softBlue rounded-b-[60px]" />
      <View className="absolute -top-32 -right-32 w-96 h-96 bg-ess-purple rounded-full opacity-5 blur-[100px]" />
      <View className="absolute top-40 -left-20 w-72 h-72 bg-ess-green rounded-full opacity-5 blur-[80px]" />

      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
        className="flex-1"
      >
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 32, paddingVertical: 40 }} showsVerticalScrollIndicator={false}>
          
          <View className="mb-10 items-center mt-10">
            <View className="w-16 h-16 bg-white rounded-[20px] items-center justify-center shadow-lg shadow-black/5 border border-ess-purple/5 mb-6">
              <Image 
                source={require('../../assets/logo.png')} 
                style={{ width: 44, height: 44, resizeMode: 'contain' }} 
                defaultSource={require('../../assets/logo.png')}
              />
            </View>
            <Text className="text-4xl font-bold text-ess-darkPurple mb-2 tracking-tight text-center">Create Account</Text>
            <Text className="text-[15px] font-medium text-gray-500 text-center tracking-wide">
              Sign up to get started
            </Text>
          </View>

          {registerError && (
            <CustomAlert 
              type="error" 
              title="Error" 
              description={registerError} 
              className="mb-6 shadow-sm shadow-red-500/10" 
            />
          )}

          {successMsg && (
            <CustomAlert 
              type="success" 
              title="Success" 
              description={successMsg} 
              className="mb-6 shadow-sm shadow-green-500/10" 
            />
          )}

          <View className="space-y-5">
            <View className="flex-row space-x-4">
              <View className="flex-1 mr-2">
                <Input
                  label="First Name"
                  placeholder="John"
                  value={firstName}
                  onChangeText={setFirstName}
                />
              </View>
              <View className="flex-1 ml-2">
                <Input
                  label="Last Name"
                  placeholder="Doe"
                  value={lastName}
                  onChangeText={setLastName}
                />
              </View>
            </View>

            <Input
              label="Email Address"
              placeholder="name@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              value={email}
              onChangeText={setEmail}
            />

            <Input
              label="Phone Number (Optional)"
              placeholder="+1 (555) 000-0000"
              keyboardType="phone-pad"
              value={phone}
              onChangeText={setPhone}
            />

            <Input
              label="Password"
              placeholder="Create a password"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />
          </View>

          <View className="mt-10">
            <Button
              variant="primary"
              size="lg"
              isLoading={isLoading}
              onPress={handleRegister}
              className="w-full shadow-lg shadow-ess-purple/20"
            >
              Sign Up
            </Button>
          </View>

          <View className="mt-8 flex-row justify-center items-center pb-10">
            <Text className="text-gray-500 font-medium tracking-wide">Already have an account? </Text>
            <Link href="/(auth)/login" asChild>
              <Text className="text-ess-purple font-bold tracking-wide">Sign In</Text>
            </Link>
          </View>
          
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
