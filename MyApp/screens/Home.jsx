import { View, Text, Button, ImageBackground } from 'react-native';


export default function Home ({navigation}) {
return(

   

    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}> 
      <Text>Home Screen</Text>
      <Text>Log In Screen</Text>
      <Button
        title="Go to Next Page"
        onPress={() => navigation.navigate('LogIn')}
      />
      
    </View>




);
}

