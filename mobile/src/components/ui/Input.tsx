import React, { forwardRef, useState } from 'react';
import { TextInput, Text, View, TextInputProps, Pressable, Platform } from 'react-native';
import { Eye, EyeOff } from 'lucide-react-native';
import { twMerge } from 'tailwind-merge';

export interface InputProps extends Omit<TextInputProps, 'className'> {
  label?: string;
  error?: string;
  leftIcon?: React.ReactNode;
  className?: string;
  containerClassName?: string;
}

export const Input = forwardRef<TextInput, InputProps>(({ label, error, className = '', containerClassName = '', onFocus, onBlur, secureTextEntry, ...props }, ref) => {
  const [isFocused, setIsFocused] = useState(false);
  const [isSecure, setIsSecure] = useState(secureTextEntry || false);

  return (
    <View className={twMerge("flex-col gap-2 w-full", containerClassName)}>
      {label && <Text className="text-[13px] font-bold tracking-wider text-ess-darkPurple uppercase ml-1">{label}</Text>}
      <View className="relative w-full justify-center">
        <TextInput
          ref={ref}
          onFocus={(e) => {
            setIsFocused(true);
            if (onFocus) onFocus(e);
          }}
          onBlur={(e) => {
            setIsFocused(false);
            if (onBlur) onBlur(e);
          }}
          className={twMerge(
            "w-full px-5 py-4 rounded-[20px] bg-white border-2 text-ess-purple font-medium text-base shadow-sm shadow-black/5",
            secureTextEntry ? "pr-12" : "",
            error 
              ? "border-red-400 bg-red-50" 
              : isFocused 
                ? "border-ess-purple/30 bg-ess-softBlue" 
                : "border-ess-purple/10",
            props.editable === false ? "bg-gray-100 text-gray-400 border-transparent" : "",
            className
          )}
          secureTextEntry={isSecure}
          placeholderTextColor="#9ca3af"
          autoCorrect={!secureTextEntry}
          spellCheck={!secureTextEntry}
          textContentType={secureTextEntry ? "password" : "none"}
          {...props}
        />
        {secureTextEntry && (
          <Pressable 
            onPress={() => setIsSecure(!isSecure)} 
            className="absolute right-4 z-10 p-2"
          >
            {isSecure ? (
              <EyeOff size={20} color="#9ca3af" />
            ) : (
              <Eye size={20} color="#9ca3af" />
            )}
          </Pressable>
        )}
      </View>
      {error && <Text className="text-[13px] text-red-500 font-semibold ml-1">{error}</Text>}
    </View>
  );
});

Input.displayName = 'Input';
